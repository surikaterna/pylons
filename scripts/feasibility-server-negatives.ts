import { resolve } from "node:path";
import { type ServerFault, startFixture } from "../apps/fixture-server/main.js";
import { isObject } from "../tests/feasibility/artifact-index.js";
import { bounded } from "../tests/feasibility/timeout.js";
import { FoundationError } from "./policy.js";

const root = resolve(import.meta.dir, "..");
type Child = ReturnType<typeof launch>;

function launch(origin: string) {
  return Bun.spawn([process.execPath, resolve(root, ".feasibility-build/hosts/web-server.js"), origin], { stdout: "pipe", stderr: "pipe" });
}

async function ready(child: Child): Promise<string> {
  const reader = child.stdout.getReader();
  try {
    const chunk = await bounded(reader.read(), 8000);
    const value: unknown = JSON.parse(new TextDecoder().decode(chunk.value));
    if (!isObject(value) || typeof value.url !== "string") throw new FoundationError("Negative server did not start");
    return value.url;
  } finally {
    reader.releaseLock();
  }
}

async function quietStdout(child: Child): Promise<boolean> {
  const reader = child.stdout.getReader();
  let quiet = true;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return quiet;
      if (chunk.value.length) quiet = false;
    }
  } finally {
    reader.releaseLock();
  }
}

async function request(origin: string, path: string) {
  const response = await fetch(new URL(`${path}?title=SECRET_DOCUMENT_SENTINEL&config=SECRET_CONFIG_SENTINEL`, origin), {
    headers: { authorization: "Bearer SECRET_HEADER_SENTINEL" },
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.text();
  return { status: response.status, body, bytes: new TextEncoder().encode(body).length };
}

function safe(text: string): void {
  if (/SENTINEL|Error:|\n\s*at\b|\/validate\?|\/shutdown\?/.test(text)) throw new FoundationError("HTTP negative leaked private input or raw error");
}

function failed(response: { status: number; body: string }, code: string): void {
  if (response.status !== 503 || response.body !== JSON.stringify({ error: { code } }))
    throw new FoundationError("HTTP negative lacked bounded failure response");
}

function execution(logs: string, fault: ServerFault): void {
  const evaluated = fault === "cleanup" ? 1 : 0;
  if (logs.split("remote evaluated").length - 1 !== evaluated || logs.split("remote activated").length - 1 !== evaluated)
    throw new FoundationError("Unexpected negative remote execution");
  if (
    fault === "cleanup" &&
    (!logs.includes("remote cleanup rejection attempted") || !logs.includes("remote final cleanup attempted") || !logs.includes("http cleanup-failed"))
  )
    throw new FoundationError("Real cleanup rejection/all-attempt observation missing");
  if (!logs.includes("http shutdown-failed")) throw new FoundationError("Shutdown failure was not safely observed");
  if (fault !== "cleanup" && (!logs.includes("http request-failed") || !logs.includes("http activation-failed")))
    throw new FoundationError("Request/activation failure was not safely observed");
}

async function serverNegative(fault: ServerFault): Promise<void> {
  const fixture = await startFixture(fault);
  const child = launch(fixture.origin);
  const stderr = new Response(child.stderr).text();
  try {
    const origin = await ready(child);
    const stdout = quietStdout(child);
    const started = Date.now();
    const validation = await request(origin, "validate");
    if (fault === "cleanup") {
      const value: unknown = JSON.parse(validation.body);
      if (validation.status !== 200 || !isObject(value) || !isObject(value.result) || value.result.success !== true)
        throw new FoundationError("Cleanup negative did not activate a real provider");
    } else failed(validation, "request-failed");
    const shutdown = await request(origin, "shutdown");
    failed(shutdown, "shutdown-failed");
    const exit = await bounded(child.exited, 2000);
    if (exit !== 0) throw new FoundationError("Negative server did not exit naturally");
    const logs = await stderr;
    if (!(await stdout)) throw new FoundationError("Negative server emitted unexpected stdout");
    safe(validation.body);
    safe(shutdown.body);
    safe(logs);
    execution(logs, fault);
    console.log(
      JSON.stringify({
        host: "server",
        fault,
        validation,
        shutdown,
        exit,
        forcedKill: false,
        milliseconds: Date.now() - started,
        requests: fixture.requests,
        transport: fixture.trace,
        evaluated: fault === "cleanup" ? 1 : 0,
        artifact: fault === "cleanup" ? fixture.artifacts.find((entry) => entry.target === "bun") : undefined,
      }),
    );
  } finally {
    // Emergency test cleanup is a failure path only; every passing scenario already awaited natural exit.
    if (child.exitCode === null) child.kill();
    await stderr;
    await fixture.stop();
  }
}

export async function serverNegatives(): Promise<void> {
  for (const fault of ["hash", "status", "timeout", "disconnect", "cleanup"] satisfies readonly ServerFault[]) await serverNegative(fault);
}
