import { authenticate } from "../shared/authority.js";
import { serverHost } from "../shared/bootstrap-server.js";
import { document, object } from "../shared/domain.js";
import type { DemoHost } from "../shared/host.js";
import { bindLogging } from "../shared/logging.js";

async function session(host: DemoHost): Promise<void> {
  let buffer = "";
  const pending = new Set<Promise<void>>();
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 100000) throw new Error("input-failed");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      dispatch(host, lines, pending);
    }
    buffer += decoder.decode();
    if (buffer.trim()) pending.add(command(host, buffer));
  } finally {
    reader.releaseLock();
  }
  await Promise.all(pending);
}
function dispatch(host: DemoHost, lines: readonly string[], pending: Set<Promise<void>>): void {
  for (const line of lines) {
    if (!line) continue;
    const work = command(host, line).finally(() => pending.delete(work));
    pending.add(work);
  }
}
async function command(host: DemoHost, line: string): Promise<void> {
  try {
    const value: unknown = JSON.parse(line);
    const id = object(value) && typeof value.id === "number" ? value.id : 0;
    console.log(JSON.stringify({ id, response: await host.command(value) }));
  } catch {
    console.log(JSON.stringify({ id: 0, response: { error: "input-failed" } }));
  }
}
async function main(): Promise<void> {
  bindLogging();
  const origin = process.argv[2];
  if (!origin) throw new Error("input-failed");
  const interactive = process.argv[3] === "--session";
  const credential = interactive ? undefined : authenticate(process.argv[3]);
  if (!interactive && !credential) throw new Error("auth-failed");
  const input: unknown = interactive ? null : JSON.parse(await Bun.file(process.argv[4] ?? "").text());
  if (!interactive && !document(input)) throw new Error("input-failed");
  const host = await serverHost(origin, "cli");
  try {
    if (interactive) {
      console.log(JSON.stringify({ ready: true }));
      await session(host);
      return;
    }
    if (!credential) throw new Error("auth-failed");
    await host.discover(credential.tenant);
    host.policy.initialize(true);
    await host.scoped(credential.tenant).startup();
    const result = await host.validate(process.argv[3], input);
    console.log(JSON.stringify(result));
    process.exitCode = result.code;
  } finally {
    const stopped = await host.shutdown();
    if (stopped.results.some((result) => !result.success)) process.exitCode = 2;
  }
}
try {
  await main();
} catch {
  console.error("demo-infrastructure-failed");
  process.exitCode = 2;
}
