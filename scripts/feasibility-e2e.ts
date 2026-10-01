import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { startFixture } from "../tests/feasibility/apps/fixture-server/main.js";
import { isObject } from "../tests/feasibility/artifact-index.js";
import { serverNegatives } from "./feasibility-server-negatives.js";
import { FoundationError } from "./policy.js";

const root = resolve(import.meta.dir, "..");
const fixture = await startFixture();

function requireProof(value: unknown): void {
  if (!isObject(value) || !isObject(value.counts) || value.counts.activations !== 1 || value.counts.invocations !== 2)
    throw new FoundationError("Local repeated invocation proof failed");
}

function requireValidation(value: unknown, valid: boolean): void {
  const result = isObject(value) && "result" in value ? value.result : value;
  if (!isObject(result) || result.success !== true || !isObject(result.data) || result.data.valid !== valid)
    throw new FoundationError("Local validation result failed");
}

function requirePair(value: unknown, first: boolean, second: boolean): void {
  if (!isObject(value)) throw new FoundationError("Invalid invocation proof");
  requireValidation(value.first, first);
  requireValidation(value.second, second);
}

function requireLogs(logs: string): void {
  for (const message of [
    "host queued before bootstrap",
    "host logger bound",
    "host warning characterization",
    "host error characterization",
    "remote evaluated",
    "remote activated",
    "remote cleaned",
  ]) {
    if (logs.split(message).length !== 2) throw new FoundationError("Host/root-bound remote logging proof failed");
  }
  if (logs.split("remote invoked").length !== 3 || logs.includes("SENTINEL")) throw new FoundationError("Invocation/redaction logging proof failed");
}

function transportSince(start: number, host: string) {
  const entries = fixture.trace.slice(start);
  const metadata = entries.findIndex((entry) => entry.path === `metadata/${host}`);
  const executable = entries.findIndex((entry) => /^(bun|browser)\/remoteEntry.js$/.test(entry.path));
  if (metadata < 0 || executable <= metadata || entries.filter((entry) => /^(bun|browser)\/remoteEntry.js$/.test(entry.path)).length !== 1)
    throw new FoundationError("Metadata-before-single-executable proof failed");
  return entries;
}

async function cli(title: string, exit: number) {
  const start = fixture.trace.length;
  const child = Bun.spawn([process.execPath, resolve(root, ".feasibility-build/hosts/cli.js"), fixture.origin, title], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== exit) throw new FoundationError(`CLI failed: expected ${exit}, actual ${code}; ${stderr}`);
  requireProof(JSON.parse(stdout));
  requirePair(JSON.parse(stdout), exit === 0, exit === 0);
  requireLogs(stderr);
  console.log(JSON.stringify({ host: "cli", exit: code, proof: JSON.parse(stdout), logs: stderr, transport: transportSince(start, "cli") }));
}

async function webServer() {
  const start = fixture.trace.length;
  const child = Bun.spawn([process.execPath, resolve(root, ".feasibility-build/hosts/web-server.js"), fixture.origin], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const reader = child.stdout.getReader();
  try {
    const chunk = await reader.read();
    const ready: unknown = JSON.parse(new TextDecoder().decode(chunk.value));
    if (!isObject(ready) || typeof ready.url !== "string") throw new FoundationError("Server startup failed");
    await fetch(new URL("metadata", ready.url));
    if (fixture.trace.slice(start).some((entry) => entry.path.endsWith("remoteEntry.js"))) throw new FoundationError("Metadata discovery executed plugin");
    const first: unknown = await fetch(new URL("validate?title=four", ready.url)).then((response) => response.json());
    const second: unknown = await fetch(new URL("validate?title=", ready.url)).then((response) => response.json());
    requireProof(second);
    requireValidation(first, true);
    requireValidation(second, false);
    await fetch(new URL("shutdown", ready.url));
    if ((await child.exited) !== 0) throw new FoundationError("Server exit failed");
    const logs = await new Response(child.stderr).text();
    requireLogs(logs);
    console.log(JSON.stringify({ host: "server", first, second, logs, transport: transportSince(start, "server") }));
  } finally {
    reader.releaseLock();
    if (child.exitCode === null) child.kill();
  }
}

async function browser(origin = fixture.origin, reject = false) {
  const start = fixture.trace.length;
  const instance = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"], timeout: 15_000 });
  try {
    const context = await instance.newContext();
    const page = await context.newPage();
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    page.on("pageerror", (error) => logs.push(error.message));
    await page.goto(new URL("browser", origin).href);
    await page.waitForFunction(() => document.getElementById("result")?.textContent !== "Loading", undefined, { timeout: 10_000 });
    const text = await page.locator("#result").innerText();
    if (reject) {
      if (text !== "infrastructure-failed" || logs.some((line) => line.includes("remote evaluated")))
        throw new FoundationError("Browser pre-evaluation integrity rejection failed");
      console.log(JSON.stringify({ host: "browser", rejected: true, evaluated: 0, activated: 0 }));
      return;
    }
    if (text === "infrastructure-failed") throw new FoundationError(`Browser MF execution failed: ${JSON.stringify(logs)}`);
    const proof: unknown = JSON.parse(text);
    requireProof(proof);
    requirePair(proof, true, false);
    requireLogs(logs.join("\n"));
    const realm = await page.evaluate(() => {
      const facade: unknown = Reflect.get(globalThis, "__slf");
      const factory = typeof facade === "object" && facade !== null && "_factory" in facade ? typeof facade._factory : "missing";
      return { global: typeof global, process: typeof process, factory };
    });
    console.log(JSON.stringify({ host: "browser", chromium: instance.version(), realm, proof, logs, transport: transportSince(start, "browser") }));
    await context.close();
  } finally {
    await instance.close();
  }
}

async function rejection(tamper: "hash" | "disabled") {
  const invalid = await startFixture(tamper);
  try {
    const child = Bun.spawn([process.execPath, resolve(root, ".feasibility-build/hosts/cli.js"), invalid.origin, "SECRET_DOCUMENT_SENTINEL"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 2 || stdout || stderr.includes("remote evaluated") || stderr.includes("SENTINEL"))
      throw new FoundationError("Pre-evaluation rejection failed");
    if (tamper === "disabled" && invalid.trace.some((entry) => entry.path.endsWith("remoteEntry.js"))) throw new FoundationError("Disabled plugin downloaded");
    console.log(JSON.stringify({ rejected: tamper, exit: code, transport: invalid.trace, evaluated: 0, activated: 0 }));
    if (tamper === "hash") await browser(invalid.origin, true);
  } finally {
    await invalid.stop();
  }
}

try {
  await cli("four", 0);
  await cli("", 1);
  await webServer();
  await browser();
  await rejection("hash");
  await rejection("disabled");
  await serverNegatives();
  console.log(JSON.stringify({ transport: fixture.trace }));
} finally {
  await fixture.stop();
}
