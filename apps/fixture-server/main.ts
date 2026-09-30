import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArtifacts } from "../../tests/feasibility/artifact-index.js";
import { fixturePlan } from "../../tests/feasibility/fixture-metadata.js";
import { cleanupRejectionArtifact } from "../../tests/feasibility/server-negative-artifacts.js";

export type ServerFault = "hash" | "disabled" | "status" | "timeout" | "disconnect" | "cleanup";

export async function startFixture(tamper?: ServerFault) {
  const output = resolve(import.meta.dir, "../../.feasibility-build");
  const original = parseArtifacts(JSON.parse(await readFile(resolve(output, "artifacts.json"), "utf8")));
  const faultBytes = tamper === "cleanup" ? cleanupRejectionArtifact(await readFile(resolve(output, "bun/remoteEntry.js"))) : undefined;
  const artifacts = original.map((entry) => entry.target === "bun" && faultBytes ? { ...entry, bytes: faultBytes.length, sha256: new Bun.CryptoHasher("sha256").update(faultBytes).digest("hex") } : entry);
  const trace: { path: string; status: number; bytes: number }[] = [];
  const requests: string[] = [];
  const server = Bun.serve({ port: 0, async fetch(request) {
    const path = new URL(request.url).pathname.slice(1);
    requests.push(path);
    if (path === "bun/remoteEntry.js" && tamper === "disconnect") {
      await server.stop(true);
      return new Response(null, { status: 503 });
    }
    const response = await respond(path, server.url.href, output, artifacts, tamper, faultBytes);
    const bytes = await response.arrayBuffer();
    trace.push({ path, status: response.status, bytes: bytes.byteLength });
    return new Response(bytes, { status: response.status, headers: { "access-control-allow-origin": "*", "content-type": path === "browser" ? "text/html" : path.endsWith(".js") ? "text/javascript" : "application/json", "cache-control": "no-store" } });
  } });
  return { origin: server.url.href, trace, requests, artifacts, stop: () => server.stop(true) };
}

async function respond(path: string, origin: string, output: string, artifacts: ReturnType<typeof parseArtifacts>, tamper?: ServerFault, faultBytes?: Uint8Array<ArrayBuffer>) {
  if (path === "bun/remoteEntry.js" && tamper === "status") return new Response("SECRET_CONFIG_SENTINEL", { status: 503 });
  if (path === "bun/remoteEntry.js" && tamper === "timeout") return new Promise<Response>(() => {});
  if (path === "bun/remoteEntry.js" && faultBytes) return new Response(faultBytes);
  const host = path.slice("metadata/".length);
  if (path.startsWith("metadata/") && (host === "server" || host === "browser" || host === "cli")) {
    const artifact = artifacts.find((entry) => entry.target === (host === "browser" ? "browser" : "bun"));
    if (artifact) {
      const plan = fixturePlan(host, origin, tamper === "hash" ? { ...artifact, sha256: "0".repeat(64) } : artifact);
      const installation = plan.inventory.installations[0];
      if (tamper === "disabled" && installation) installation.enabled = false;
      return Response.json(plan);
    }
  }
  if (artifacts.some((entry) => entry.file === path)) return new Response(await readFile(resolve(output, path)));
  if (path === "host/browser.js") return new Response(await readFile(resolve(output, "hosts/browser.js")));
  if (path === "browser") return new Response('<!doctype html><html><title>Private feasibility</title><body><pre id="result" role="status">Loading</pre><script src="/host/browser.js"></script></body></html>');
  return new Response("not-found", { status: 404 });
}
