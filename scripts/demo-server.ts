import { join } from "node:path";
import { object } from "../apps/shared/domain.js";
import { FoundationError } from "./policy.js";

export type ServerSupervision = { readonly kind: "interactive" } | { readonly kind: "bounded"; readonly timeoutMilliseconds: number };
export interface ServerClient {
  readonly url: string;
  command(value: Record<string, unknown>): Promise<unknown>;
  close(): Promise<{ readonly exit: number }>;
}
function launch(origin: string, supervision: ServerSupervision) {
  const bounds = supervision.kind === "bounded" ? { timeout: supervision.timeoutMilliseconds } : {};
  return Bun.spawn([process.execPath, join(process.cwd(), ".demo-build/hosts/server.js"), origin], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    ...bounds,
  });
}
async function startup(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  try {
    while (!text.includes("\n")) {
      const chunk = await reader.read();
      if (chunk.done) throw new FoundationError("demo-server-startup");
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 10000) throw new FoundationError("demo-server-startup");
    }
    return JSON.parse(text.slice(0, text.indexOf("\n")));
  } finally {
    reader.releaseLock();
  }
}
async function send(url: string, value: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(new URL("__demo", url), {
    method: "POST",
    headers: { authorization: "Bearer demo-operator", "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new FoundationError("demo-server-command");
  return response.json();
}
export async function serverClient(origin: string, supervision: ServerSupervision): Promise<ServerClient> {
  const process = launch(origin, supervision);
  const errors = new Response(process.stderr).text();
  const ready = await startup(process.stdout);
  if (!object(ready) || typeof ready.url !== "string") throw new FoundationError("demo-server-startup");
  const url = ready.url;
  let stopped: Promise<{ readonly exit: number }> | undefined;
  const close = async () => {
    await send(url, { op: "exit" });
    const exit = await process.exited;
    if (exit !== 0 || process.signalCode !== null || (await errors).includes("SENTINEL")) throw new FoundationError("demo-server-native-exit");
    return { exit };
  };
  return {
    url,
    command: (value) => send(url, value),
    close() {
      stopped ??= close();
      return stopped;
    },
  };
}
