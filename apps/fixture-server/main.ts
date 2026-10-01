import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Host } from "@pylons/contracts";
import type { Artifact } from "../shared/definitions.js";
import { tenant } from "../shared/domain.js";
import { parseArtifacts } from "../shared/source.js";
import { control } from "./control.js";
import { resolvedPlan, type ScopeState, state } from "./state.js";

export interface HttpTrace {
  readonly path: string;
  readonly status: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly at: number;
}
export async function startFixture(port = 0, horizon = 10000) {
  const output = resolve(import.meta.dir, "../../.demo-build");
  const artifacts = parseArtifacts(JSON.parse(await readFile(resolve(output, "artifacts.json"), "utf8")));
  const scopes = { a: state(Date.now() + horizon), b: state(Date.now() + horizon) };
  scopes.b.values["basic-validation"].minLength = 8;
  const trace: HttpTrace[] = [];
  const requests: string[] = [];
  const held = new Map<string, { promise: Promise<void>; release: () => void }>();
  const faults = new Set<string>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname.slice(1);
      requests.push(path);
      const response = await route(path, request, server.url.href, output, artifacts, scopes, held, faults);
      const bytes = await response.arrayBuffer();
      trace.push({
        path,
        status: response.status,
        bytes: bytes.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        at: Date.now(),
      });
      return responseBytes(path, bytes, response.status);
    },
    error: () => Response.json({ error: "fixture-failed" }, { status: 503 }),
  });
  return {
    origin: server.url.href,
    scopes,
    trace,
    requests,
    artifacts,
    hold(key: string) {
      createHold(held, key);
    },
    release(key: string) {
      release(held, key);
    },
    fail(path: string) {
      faults.add(path);
    },
    async stop() {
      for (const key of held.keys()) release(held, key);
      await server.stop(true);
    },
  };
}
function responseBytes(path: string, bytes: ArrayBuffer, status: number): Response {
  return new Response(bytes, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "cache-control": "no-store",
      "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path === "browser" ? "text/html" : "application/json",
    },
  });
}
function createHold(held: Map<string, { promise: Promise<void>; release: () => void }>, key: string): void {
  let complete = () => {};
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  held.set(key, { promise, release: complete });
}
function release(held: Map<string, { promise: Promise<void>; release: () => void }>, key: string): void {
  held.get(key)?.release();
  held.delete(key);
}
async function route(
  path: string,
  request: Request,
  origin: string,
  output: string,
  artifacts: readonly Artifact[],
  scopes: { a: ScopeState; b: ScopeState },
  held: Map<string, { promise: Promise<void>; release: () => void }>,
  faults: ReadonlySet<string>,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "control") return control(request, scopes);
  await held.get(path)?.promise;
  if (faults.has(path)) return Response.json({ error: "SECRET_ERROR_SENTINEL" }, { status: 503 });
  if (path === "operator/artifacts")
    return request.headers.get("authorization") === "Bearer demo-operator" ? Response.json(artifacts) : new Response(null, { status: 401 });
  if (path.startsWith("metadata/") || path.startsWith("catalog/")) return metadata(path, request, origin, artifacts, scopes);
  if (path.startsWith("init/")) return Response.json({ initialized: true });
  if (artifacts.some((artifact) => artifact.file === path)) return new Response(await readFile(resolve(output, path)));
  if (path === "host/browser.js" || path === "styles.css")
    return new Response(await readFile(resolve(output, path === "styles.css" ? "styles.css" : "hosts/browser.js")));
  if (path === "browser") return new Response(await readFile(resolve(output, "index.html")));
  if (path.startsWith("documents/") && ["short", "long", "empty", "no-reference"].includes(path.slice(10))) {
    const name = path.slice(10);
    return Response.json({
      title: name === "empty" ? "" : name === "short" ? "four" : "A long document title",
      ...(name === "long" ? { reference: "REF-1" } : {}),
    });
  }
  if (path === "trace") return Response.json([]);
  return new Response(null, { status: 404 });
}
function metadata(path: string, request: Request, origin: string, artifacts: readonly Artifact[], scopes: { a: ScopeState; b: ScopeState }): Response {
  const [, host, scope] = path.split("/");
  if (!tenant(scope) || !(host === "server" || host === "browser" || host === "cli")) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer metadata-${host}-${scope}` || !scopes[scope].authorized) return new Response(null, { status: 403 });
  if (scopes[scope].outage) return new Response(null, { status: 503 });
  return Response.json(resolvedPlan(host satisfies Host, scope, origin, artifacts, scopes[scope]));
}
