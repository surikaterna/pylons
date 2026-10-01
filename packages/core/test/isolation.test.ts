import { expect, test } from "bun:test";
import type { ActivatedInstance, ActivationContext, ActivationFailure, ArtifactLoader, Result } from "@pylons/contracts";
import { capability, capabilityDependency, deferred, extension, harness, plan, pluginDependency, request, signal } from "./fixtures.js";

test("two runtimes isolate tenant configurations and every request context", async () => {
  const a = harness(plan([{ id: "base", entries: [extension()], value: 3 }], "r", "a"));
  const b = harness(plan([{ id: "base", entries: [extension()], value: 8 }], "r", "b"));
  await Promise.all([a.runtime.refresh(), b.runtime.refresh()]);
  await Promise.all([a.runtime.demand(capability, signal()), b.runtime.demand(capability, signal())]);
  const results = await Promise.all([
    a.runtime.invoke(capability, null, request("alice")),
    b.runtime.invoke(capability, null, request("bob")),
    a.runtime.invoke(capability, null, request("carol")),
  ]);
  expect(results).toEqual([
    {
      success: true,
      data: { input: null, values: { minimum: 3 }, subject: "alice", credential: "alice-credential", transaction: "alice-transaction", tenant: "a" },
    },
    { success: true, data: { input: null, values: { minimum: 8 }, subject: "bob", credential: "bob-credential", transaction: "bob-transaction", tenant: "b" } },
    {
      success: true,
      data: { input: null, values: { minimum: 3 }, subject: "carol", credential: "carol-credential", transaction: "carol-transaction", tenant: "a" },
    },
  ]);
  await a.runtime.shutdown();
  expect((await b.runtime.invoke(capability, null, request())).success).toBe(true);
  await b.runtime.shutdown();
});

test("required capability providers initialize before dependents; unrelated graph survives cycles", async () => {
  const base = { capabilityId: "base", contractVersion: "opaque" };
  const order: string[] = [];
  const h = harness(
    plan([
      { id: "consumer", entries: [extension()], dependencies: [capabilityDependency(base)] },
      { id: "provider", entries: [extension("provider", [], [base])] },
      { id: "cycle", entries: [extension("cycle", [], [])], dependencies: [pluginDependency("cycle")] },
    ]),
    {
      async activate(context) {
        const id = context.generation.definition.pluginId;
        order.push(id);
        context.providers.register(id === "provider" ? base : capability, {
          async invoke() {
            return { success: true, data: null };
          },
        });
        return {
          success: true,
          data: {
            async cleanup() {
              return { success: true, data: undefined };
            },
          },
        };
      },
    },
  );
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect(order).toEqual(["provider", "consumer"]);
  expect(h.runtime.snapshots().find((snapshot) => snapshot.generation.definition.pluginId === "cycle")?.failureCode).toBe("dependency-cycle");
  await h.runtime.shutdown();
});

test("mandatory security startup gates protected invocation and authoritative bypass denial", async () => {
  const security = { capabilityId: "security", contractVersion: "opaque" };
  const h = harness(
    plan([
      { id: "base", entries: [extension()] },
      { id: "security", entries: [{ ...extension("security", [], [security]), activation: { kind: "startup" } }] },
    ]),
    {},
    { securityStartupCapabilities: [security] },
  );
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  h.deny();
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  await h.runtime.shutdown();
  const missing = harness(undefined, {}, { securityStartupCapabilities: [security] });
  await missing.runtime.refresh();
  await missing.runtime.demand(capability, signal());
  expect((await missing.runtime.startup()).success).toBe(false);
  expect((await missing.runtime.invoke(capability, null, request())).success).toBe(false);
  await missing.runtime.shutdown();
});

test("external ready host capability is distinct from self-readiness", async () => {
  const external = { capabilityId: "external", contractVersion: "opaque" };
  let ready = true;
  const h = harness(
    plan([{ id: "base", entries: [extension()], dependencies: [capabilityDependency(external)] }]),
    {},
    {
      hostCapabilities: [
        {
          capability: external,
          provider: {
            async invoke() {
              return { success: true, data: null };
            },
          },
          isReady: () => ready,
        },
      ],
    },
  );
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  ready = false;
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  await h.runtime.shutdown();
});

test("policy/compatibility rejection happens before any load", async () => {
  const rejected = harness(undefined, {
    async policy() {
      return { kind: "deny", code: "untrusted" };
    },
  });
  await rejected.runtime.refresh();
  expect((await rejected.runtime.demand(capability, signal())).success).toBe(false);
  expect(rejected.counts().loads).toBe(0);
  await rejected.runtime.shutdown();
  const mismatch = harness(undefined, {}, { hostContractVersion: "^opaque" });
  await mismatch.runtime.refresh();
  expect((await mismatch.runtime.demand(capability, signal())).success).toBe(false);
  expect(mismatch.counts().loads).toBe(0);
  await mismatch.runtime.shutdown();
});

test("shutdown during loader await prevents activate", async () => {
  const started = deferred<undefined>();
  const completion =
    deferred<Result<{ activate(context: ActivationContext): Promise<Result<ActivatedInstance, ActivationFailure>> }, { readonly code: "load-failed" }>>();
  let activates = 0;
  const loader: ArtifactLoader = {
    async load() {
      started.resolve(undefined);
      return completion.promise;
    },
  };
  const h = harness(undefined, {}, { loader });
  await h.runtime.refresh();
  const demand = h.runtime.demand(capability, signal());
  await started.promise;
  await h.runtime.shutdown();
  completion.resolve({
    success: true,
    data: {
      async activate() {
        activates++;
        return { success: false, error: { code: "initialization-failed" } };
      },
    },
  });
  expect((await demand).success).toBe(false);
  expect(activates).toBe(0);
  expect(h.clock.pending).toBe(0);
});

test("required plugins are exact enabled definitions, never merely installed or another version", async () => {
  for (const provider of [
    { id: "provider", enabled: false },
    { id: "provider", version: "v2" },
  ]) {
    const h = harness(plan([{ id: "base", entries: [extension()], dependencies: [pluginDependency("provider")] }, provider]));
    await h.runtime.refresh();
    expect((await h.runtime.demand(capability, signal())).success).toBe(false);
    expect(h.counts().loads).toBe(0);
    await h.runtime.shutdown();
  }
});
