import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ResolvedPlan, SourceFailure, VerifiedContext } from "@pylons/contracts";
import { createHttpDefinitionCatalog, createHttpPlanSource } from "../src/index.js";
import { Cancel, context, definition, options, plan, TestClock } from "./fixtures.js";

let server: ReturnType<typeof Bun.serve>;
let origin = "";
const requests: string[] = [];
let redirected = 0;
const mutations: Record<string, (value: ResolvedPlan) => unknown> = {
  scope: (value) => ({ ...value, inventory: { ...value.inventory, scope: { hostId: "host", tenantId: "other" } } }),
  revision: (value) => ({ ...value, provenance: { ...value.provenance, revision: "other" } }),
  config: (value) => ({ ...value, configs: value.configs.map((config) => ({ ...config, revision: "other" })) }),
  configScope: (value) => ({ ...value, configs: value.configs.map((config) => ({ ...config, scope: { hostId: "other", tenantId: "other" } })) }),
  wrongRef: (value) => ({ ...value, definitions: value.definitions.map((entry) => ({ ...entry, identity: { ...entry.identity, pluginId: "other" } })) }),
  auth: (value) => ({ ...value, provenance: { ...value.provenance, authorizationId: "other" } }),
  source: (value) => ({ ...value, provenance: { ...value.provenance, sourceId: "other" } }),
  horizon: (value) => ({ ...value, inventory: { ...value.inventory, validity: { freshUntil: 3000, authorizedUntil: 1500 } } }),
  authorization: (value) => ({ ...value, inventory: { ...value.inventory, validity: { freshUntil: 1500, authorizedUntil: 3000 } } }),
  expired: () => plan(context, "r", 999),
  infinite: (value) => ({ ...value, inventory: { ...value.inventory, validity: { freshUntil: null, authorizedUntil: 1500 } } }),
};
function response(request: Request): Response {
  const path = new URL(request.url).pathname.slice(1);
  requests.push(path);
  if (path === "target") redirected++;
  if (path === "redirect") return new Response(null, { status: 302, headers: { location: `${origin}/target` } });
  if (/^status-/.test(path)) return new Response("private URL/document/credential", { status: Number(path.slice(7)) });
  if (path === "bad-json") return new Response("{secret");
  if (path === "declared") return new Response("small", { headers: { "content-length": "10000" } });
  if (path === "oversize") return streamed(10000);
  if (path === "utf8") return new Response(new Uint8Array([0xff]));
  const scope: VerifiedContext = {
    scope: { hostId: "host", tenantId: request.headers.get("x-tenant") ?? "tenant-a" },
    authorizationId: request.headers.get("x-authorization") ?? "grant-a",
  };
  const value = plan(scope);
  return Response.json(mutations[path]?.(value) ?? value);
}
function streamed(bytes: number): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
  );
}
beforeAll(() => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: response });
  origin = server.url.origin;
});
afterAll(() => server.stop(true));

test("real HTTP plan and catalog parse canonical metadata without code requests", async () => {
  const cancel = new Cancel();
  const clock = new TestClock();
  const settings = options(`${origin}/plan`, clock);
  expect(await createHttpPlanSource(settings).read(context, cancel)).toEqual({ success: true, data: plan() });
  const expected = plan().definitions[0];
  if (!expected) throw new Error("Fixture definition missing");
  expect(await createHttpDefinitionCatalog(settings, context).read(definition, cancel)).toEqual({ success: true, data: expected });
  expect(clock.timers.size).toBe(0);
  expect(cancel.subscriptions).toBe(0);
  expect(requests.every((path) => !path.endsWith(".js"))).toBe(true);
});
const statusCases: readonly (readonly [number, SourceFailure["code"]])[] = [
  [401, "unauthorized"],
  [403, "unauthorized"],
  [404, "unavailable"],
  [500, "unavailable"],
  [204, "unavailable"],
];
for (const [status, code] of statusCases) {
  test(`real HTTP status ${status} is safe ${code}`, async () => {
    expect(await createHttpPlanSource(options(`${origin}/status-${status}`)).read(context, new Cancel())).toEqual({ success: false, error: { code } });
  });
}
for (const path of Object.keys(mutations)) {
  test(`real HTTP rejects incoherent ${path}`, async () => {
    const result = await createHttpPlanSource(options(`${origin}/${path}`)).read(context, new Cancel());
    expect(result).toEqual({ success: false, error: { code: ["auth", "source", "authorization"].includes(path) ? "unauthorized" : "invalid-plan" } });
  });
}
for (const path of ["bad-json", "declared", "oversize", "utf8", "redirect"]) {
  test(`real HTTP rejects ${path} without following redirects`, async () => {
    const result = await createHttpPlanSource(options(`${origin}/${path}`)).read(context, new Cancel());
    expect(result).toEqual({ success: false, error: { code: ["redirect", "utf8"].includes(path) ? "unavailable" : "invalid-plan" } });
    expect(redirected).toBe(0);
  });
}
test("catalog requested ref exact, 404 and source denial mapped into existing catalog codes", async () => {
  const catalog = createHttpDefinitionCatalog(options(`${origin}/plan`), context);
  expect(await catalog.read({ ...definition, definitionVersion: "2.0.0" }, new Cancel())).toEqual({ success: false, error: { code: "invalid-definition" } });
  expect(await createHttpDefinitionCatalog(options(`${origin}/status-404`), context).read(definition, new Cancel())).toEqual({
    success: false,
    error: { code: "not-found" },
  });
  expect(await createHttpDefinitionCatalog(options(`${origin}/auth`), context).read(definition, new Cancel())).toEqual({
    success: false,
    error: { code: "unavailable" },
  });
});
test("concurrent real HTTP tenants and authorization identities stay separate; no cache", async () => {
  const source = createHttpPlanSource(options(`${origin}/plan`));
  const contexts = [context, { ...context, authorizationId: "grant-b" }, { scope: { hostId: "host", tenantId: "tenant-b" }, authorizationId: "grant-b" }];
  const results = await Promise.all(contexts.map((entry) => source.read(entry, new Cancel())));
  expect(results).toEqual(contexts.map((entry) => ({ success: true, data: plan(entry) })));
  const before = requests.length;
  await source.read(context, new Cancel());
  await source.read(context, new Cancel());
  expect(requests.length - before).toBe(2);
});
test("mandatory origin trust and revocation fail closed before HTTP", async () => {
  const base = options(`${origin}/plan`);
  const before = requests.length;
  const source = createHttpPlanSource({ ...base, resolveEndpoint: () => ({ url: "https://untrusted.invalid/private?secret=credential", headers: {} }) });
  expect(await source.read(context, new Cancel())).toEqual({ success: false, error: { code: "unauthorized" } });
  expect(await createHttpPlanSource(base).read({ ...context, authorizationId: "revoked" }, new Cancel())).toEqual({
    success: false,
    error: { code: "unauthorized" },
  });
  expect(requests.length).toBe(before);
});
