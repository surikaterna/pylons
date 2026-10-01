import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { FoundationError } from "./policy.js";

interface Trace {
  readonly path: string;
  readonly status: number;
  readonly bytes: number;
}
interface Proof {
  readonly proof: { readonly code: string; readonly sameFactory?: boolean; readonly instances?: unknown; readonly rivalCode?: string };
  readonly metrics: unknown;
}
function proof(value: unknown): value is Proof {
  if (typeof value !== "object" || value === null || !("proof" in value) || !("metrics" in value)) return false;
  return typeof value.proof === "object" && value.proof !== null && "code" in value.proof && typeof value.proof.code === "string";
}

async function browserHost(browser: Browser, origin: string, mode: string): Promise<Proof> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.addInitScript((tamper) => {
      const active = new Set<string>();
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        active.add(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        active.delete(url);
        revoke(url);
      };
      Reflect.set(globalThis, "loaderActiveUrls", () => active.size);
      if (!tamper) return;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "integrity");
      const setter = descriptor?.set;
      if (!setter) throw new Error("native-sri-setter-missing");
      Object.defineProperty(HTMLScriptElement.prototype, "integrity", {
        ...descriptor,
        set(value: string) {
          setter.call(this, value ? `sha256-${btoa("x".repeat(32))}` : value);
        },
      });
    }, mode === "sri");
    await page.goto(origin);
    await page.waitForFunction(() => Reflect.get(globalThis, "loaderProof") !== undefined, { timeout: 5000 });
    const result: unknown = await page.evaluate(() => Reflect.get(globalThis, "loaderProof"));
    if (!proof(result)) throw new FoundationError("invalid-browser-proof");
    const resources = await page.evaluate(() => {
      const count: unknown = Reflect.get(globalThis, "loaderActiveUrls");
      return { urls: typeof count === "function" ? count() : -1, scripts: document.querySelectorAll('script[src^="blob:"]').length };
    });
    assert.deepEqual(resources, { urls: 0, scripts: 0 });
    return result;
  } finally {
    await context.close();
  }
}

async function bunHost(hostDirectory: string, origin: string, host: "server" | "cli"): Promise<Proof> {
  const child = Bun.spawn([process.execPath, join(hostDirectory, "loader-bun-host.js"), origin, host], { stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    assert.equal(exit, 0);
    assert.equal(stderr, "");
    const result: unknown = JSON.parse(stdout);
    if (!proof(result)) throw new FoundationError("invalid-bun-proof");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function verify(result: Proof, scenario: string, traces: readonly Trace[]) {
  const positive = ["positive", "shared-cancel", "version-race", "alias"].includes(scenario);
  const denied = ["denied", "origin", "binding", "fanout"].includes(scenario);
  const code = positive
    ? "loaded"
    : denied
      ? "denied"
      : scenario === "wrong-export"
        ? "invalid-factory"
        : scenario === "hash"
          ? "integrity-mismatch"
          : scenario === "cancel"
            ? "cancelled"
            : "load-failed";
  assert.equal(result.proof.code, code);
  assert.deepEqual(result.metrics, {
    evaluated: positive || scenario === "wrong-export" ? 1 : 0,
    activated: positive ? 2 : 0,
    invoked: positive ? 4 : 0,
    cleaned: positive ? 2 : 0,
  });
  const scripts = traces.filter((trace) => /^(browser|server)\.js$/.test(trace.path));
  if (denied) assert.equal(scripts.length, 0);
  if (positive || ["hash", "wrong-export", "status", "size", "redirect"].includes(scenario)) assert.equal(scripts.length, 1);
  if (positive) {
    assert.equal(result.proof.sameFactory, true);
    assert.deepEqual(result.proof.instances, [
      { first: { valid: true, tenant: "a", identity: "a-first" }, second: { valid: true, tenant: "a", identity: "a-second" } },
      { first: { valid: false, tenant: "b", identity: "b-first" }, second: { valid: false, tenant: "b", identity: "b-second" } },
    ]);
    assert.equal(traces[0]?.path, "metadata");
  }
  assert.equal(traces.filter((trace) => trace.path === "unchecked-target").length, 0);
  if (["version-race", "alias"].includes(scenario)) assert.equal(result.proof.rivalCode, "denied");
}

function fixtureServer(hostDirectory: string, mode: string, artifact: Uint8Array, digest: string, executableFiles: readonly string[], traces: Trace[]) {
  let disconnect = () => {};
  const owned = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname.slice(1);
      if (path === "metadata") {
        const body = JSON.stringify({ digest, scenario: mode, executableFiles });
        traces.push({ path, status: 200, bytes: new TextEncoder().encode(body).length });
        return new Response(body, { headers: { "content-type": "application/json" } });
      }
      if (path === "") return new Response('<script type="module" src="/host.js"></script>', { headers: { "content-type": "text/html" } });
      if (path === "host.js") return new Response(Bun.file(join(hostDirectory, "loader-browser-host.js")), { headers: { "content-type": "text/javascript" } });
      if (/^(browser|server)\.js$/.test(path) && mode === "disconnect") {
        setTimeout(disconnect, 0);
        return new Promise<Response>(() => {});
      }
      if (/^(browser|server)\.js$/.test(path)) return serveArtifact(path, mode, artifact, traces);
      if (path === "unchecked-target") traces.push({ path, status: 200, bytes: artifact.length });
      return new Response(null, { status: 404 });
    },
    error() {
      return new Response(null, { status: 503 });
    },
  });
  disconnect = () => {
    owned.stop(true);
  };
  return owned;
}

async function scenario(root: string, hostDirectory: string, browser: Browser, host: "browser" | "server" | "cli", mode: string) {
  const target = host === "browser" ? "browser" : "server";
  const artifactRoot = join(root, `.loader-build/${mode === "fanout" ? `${target}-fanout` : target}`);
  const artifact = await readFile(join(artifactRoot, "remoteEntry.js"));
  const executableFiles = await readdir(artifactRoot);
  const digest = mode === "hash" ? "a".repeat(64) : new Bun.CryptoHasher("sha256").update(artifact).digest("hex");
  const traces: Trace[] = [];
  const owned = fixtureServer(hostDirectory, mode, artifact, digest, executableFiles, traces);
  try {
    const result = host === "browser" ? await browserHost(browser, owned.url.href, mode) : await bunHost(hostDirectory, owned.url.href, host);
    verify(result, mode, traces);
    console.log(
      JSON.stringify({
        host,
        scenario: mode,
        ...result,
        traces,
        artifact: { bytes: artifact.length, sha256: new Bun.CryptoHasher("sha256").update(artifact).digest("hex") },
      }),
    );
  } finally {
    owned.stop(true);
  }
}

async function serveArtifact(path: string, mode: string, artifact: Uint8Array, traces: Trace[]): Promise<Response> {
  if (["cancel", "shared-cancel"].includes(mode)) await new Promise((resolve) => setTimeout(resolve, mode === "cancel" ? 200 : 30));
  if (mode === "timeout") return new Promise(() => {});
  const status = mode === "status" ? 503 : mode === "redirect" ? 302 : 200;
  traces.push({ path, status, bytes: status === 200 ? artifact.length : 0 });
  if (status === 302) return new Response(null, { status, headers: { location: "/unchecked-target" } });
  return new Response(status === 200 ? new Uint8Array(artifact) : "PRIVATE_DOCUMENT_SENTINEL", { status, headers: { "content-type": "text/javascript" } });
}

export async function loaderE2E(root: string, hostDirectory: string) {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
  try {
    console.log(`Loader real artifact E2E Chromium ${browser.version()} Bun ${Bun.version}`);
    for (const host of ["cli", "server", "browser"] satisfies readonly ("cli" | "server" | "browser")[]) {
      for (const mode of [
        "positive",
        "denied",
        "origin",
        "binding",
        "fanout",
        "hash",
        "wrong-export",
        "status",
        "redirect",
        "size",
        "timeout",
        "cancel",
        "shared-cancel",
        "version-race",
        "alias",
        "disconnect",
      ])
        await scenario(root, hostDirectory, browser, host, mode);
    }
    await scenario(root, hostDirectory, browser, "browser", "sri");
  } finally {
    await browser.close();
  }
}

if (import.meta.main) await loaderE2E(process.cwd(), join(process.cwd(), ".loader-build/hosts"));
