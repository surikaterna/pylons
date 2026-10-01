import { expect, test } from "bun:test";
import { parsePluginDefinition } from "@pylons/contracts";
import { control } from "../../apps/fixture-server/control.js";
import { resolvedPlan, state } from "../../apps/fixture-server/state.js";
import { authenticate, SecurityPolicy } from "../../apps/shared/authority.js";
import { type Artifact, artifactFor, binding, definition } from "../../apps/shared/definitions.js";
import { document, validation, validResult } from "../../apps/shared/domain.js";
import { DemoHost } from "../../apps/shared/host.js";
import { HostClock, Signal } from "../../apps/shared/lifetime.js";
import { metadataPorts, parseArtifacts } from "../../apps/shared/source.js";

const artifacts: readonly Artifact[] = ["basic-validation", "reference-required"]
  .flatMap((plugin) =>
    ["browser", "server"].map((target) => ({ plugin, target, file: `artifacts/${plugin}/${target}.js`, bytes: 100, sha256: "a".repeat(64) })),
  )
  .filter(artifactGuard);
function artifactGuard(value: { plugin: string; target: string; file: string; bytes: number; sha256: string }): value is Artifact {
  return (value.plugin === "basic-validation" || value.plugin === "reference-required") && (value.target === "browser" || value.target === "server");
}
test("private author manifests match canonical data-only HTTP definitions", async () => {
  for (const plugin of ["basic-validation", "reference-required"] satisfies readonly ("basic-validation" | "reference-required")[]) {
    const result = parsePluginDefinition(JSON.parse(await Bun.file(`plugins/${plugin}/manifest.json`).text()));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(definition(plugin));
  }
});
test("typed document shape is not bundled domain minimum/reference validation", () => {
  expect(document({ title: "" })).toBe(true);
  expect(document({ title: 3 })).toBe(false);
  expect(document({ title: "four", tenant: "b" })).toBe(false);
  expect(validResult({ valid: false })).toBe(false);
  expect(validResult({ valid: true })).toBe(true);
});
test("credentials derive verified tenant and fresh request identity, not body claims", async () => {
  const policy = new SecurityPolicy();
  const credential = authenticate("a-alice");
  if (!credential) throw new Error("invalid-test");
  expect(policy.ready).toBe(false);
  expect(policy.initialize(true)).toBe(true);
  const request = policy.request(credential);
  expect(
    (
      await policy.authorize({
        capability: validation,
        verifiedContext: { scope: { hostId: "host", tenantId: "b" }, authorizationId: "b" },
        invocation: request,
      })
    ).kind,
  ).toBe("deny");
  expect(policy.request(credential).transaction.id).not.toBe(request.transaction.id);
  expect(policy.initialize(false)).toBe(false);
  expect(authenticate("SECRET_HEADER_SENTINEL")).toBeUndefined();
});
test("operator mappings reject duplicate, malformed or mismatched generated identities", () => {
  expect(parseArtifacts(artifacts).length).toBe(4);
  expect(() => parseArtifacts([...artifacts, artifacts[0]])).toThrow();
  expect(() => parseArtifacts(artifacts.map((value) => ({ ...value, file: "artifacts/basic-validation/browser.js" })))).toThrow();
  const base = definition("basic-validation");
  expect(binding(artifactFor(artifacts, "basic-validation", "cli"), "http://127.0.0.1:1234/").integrity.digest).toBe("a".repeat(64));
  expect(base.extensions[0]?.provides).toEqual([validation]);
});
test("private mutation controls require operator authentication and preserve other scope", async () => {
  const scopes = { a: state(Date.now() + 1000), b: state(Date.now() + 1000) };
  const body = JSON.stringify({ tenant: "a", revision: "r2", values: { "basic-validation": { minLength: 8 } } });
  expect((await control(new Request("http://localhost/control", { method: "POST", body }), scopes)).status).toBe(401);
  expect(scopes.a.revision).toBe("r1");
  expect(
    (await control(new Request("http://localhost/control", { method: "POST", headers: { authorization: "Bearer demo-operator" }, body }), scopes)).status,
  ).toBe(200);
  expect(scopes.a.values["basic-validation"].minLength).toBe(8);
  expect(scopes.b.revision).toBe("r1");
});
test("actual public HTTP plan/catalog ports stay data-only and honor scoped provenance", async () => {
  let requests = 0;
  const selected = state(Date.now() + 10000);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Response {
      requests++;
      if (request.headers.get("authorization") !== "Bearer metadata-cli-a") return new Response(null, { status: 403 });
      return Response.json(resolvedPlan("cli", "a", server.url.href, artifacts, selected));
    },
  });
  const clock = new HostClock();
  try {
    const ports = metadataPorts(server.url.href, "cli", "a", clock);
    expect((await ports.source.read(ports.context, new Signal())).success).toBe(true);
    expect((await ports.catalog.read({ pluginId: "basic-validation", definitionVersion: "1" }, new Signal())).success).toBe(true);
    expect((await ports.catalog.read({ pluginId: "reference-required", definitionVersion: "1" }, new Signal())).success).toBe(false);
    const foreign = metadataPorts(server.url.href, "cli", "b", clock);
    expect((await foreign.source.read(foreign.context, new Signal())).success).toBe(false);
    expect(requests).toBe(4);
    expect(clock.pending).toBe(0);
  } finally {
    await server.stop(true);
  }
});
test("root shutdown is idempotent and attempts every explicitly owned disposer", async () => {
  const host = new DemoHost(
    "cli",
    "http://127.0.0.1:1234/",
    {
      async load() {
        return { success: false, error: { code: "denied" } };
      },
    },
    artifacts,
  );
  let attempts = 0;
  host.own(() => {
    attempts++;
    throw new Error("SECRET_ERROR_SENTINEL");
  });
  host.own(() => {
    attempts++;
  });
  await host.shutdown();
  await host.shutdown();
  expect(attempts).toBe(2);
  expect(host.report().rootsCleaned).toBe(2);
  expect(host.clock.pending).toBe(0);
});
