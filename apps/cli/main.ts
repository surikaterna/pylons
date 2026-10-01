import { authenticate } from "../shared/authority.js";
import { serverHost } from "../shared/bootstrap-server.js";
import { document, object } from "../shared/domain.js";
import type { DemoHost } from "../shared/host.js";
import { bindLogging } from "../shared/logging.js";
import { printDiagnostics } from "./diagnostics.js";

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
  const args = process.argv.slice(2).filter((entry) => entry !== "--diagnostics");
  const detailed = process.argv.includes("--diagnostics");
  const origin = args[0];
  if (!origin) throw new Error("input-failed");
  const interactive = args[1] === "--session";
  const credential = interactive ? undefined : authenticate(args[1]);
  if (!interactive && !credential) throw new Error("auth-failed");
  const input: unknown = interactive ? null : JSON.parse(await Bun.file(args[2] ?? "").text());
  if (!interactive && !document(input)) throw new Error("input-failed");
  const host = await serverHost(origin, "cli");
  try {
    if (interactive) {
      console.log(JSON.stringify({ ready: true }));
      await session(host);
      return;
    }
    if (!credential) throw new Error("auth-failed");
    const discovery = await host.discover(credential.tenant);
    if (!discovery.result.success || discovery.catalog.some((entry) => !entry)) {
      console.log(JSON.stringify({ code: 2, error: "discovery-failed" }));
      process.exitCode = 2;
      printDiagnostics(host, detailed, "discovery failed; before shutdown");
      return;
    }
    host.initializeSecurity(true);
    await host.scoped(credential.tenant).startup();
    const result = await host.validate(args[1], input);
    console.log(JSON.stringify(result));
    process.exitCode = result.code;
    printDiagnostics(host, detailed, "before shutdown");
  } finally {
    const stopped = await host.shutdown();
    printDiagnostics(host, detailed, "after shutdown");
    if (stopped.results.some((result) => !result.success)) process.exitCode = 2;
  }
}
try {
  await main();
} catch {
  console.error("demo-infrastructure-failed");
  process.exitCode = 2;
}
