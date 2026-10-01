import { expect, test } from "bun:test";
import type { ActivatedInstance, ActivationContext, ActivationFailure, Result } from "@pylons/contracts";
import { capability, capabilityDependency, deferred, extension, flush, harness, plan, pluginDependency, request, signal } from "./fixtures.js";

test("metadata is zero execution; demand is singleflight and invoke authorizes every call", async () => {
  const h = harness();
  expect((await h.runtime.refresh()).success).toBe(true);
  expect(h.runtime.metadata()).toHaveLength(1);
  expect(h.counts().loads).toBe(0);
  await Promise.all([h.runtime.demand(capability, signal()), h.runtime.demand(capability, signal())]);
  expect(h.counts().activations).toBe(1);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  h.deny();
  expect(await h.runtime.invoke(capability, null, request())).toEqual({ success: false, error: { code: "denied" } });
  expect(h.counts().calls).toBe(1);
  expect(h.counts().authorizations).toBe(2);
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
});

test("declaration-only satisfies plugin presence but never capability readiness", async () => {
  const h = harness(plan([{ id: "declaration" }, { id: "base", entries: [extension()], dependencies: [pluginDependency("declaration")] }]));
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect(h.counts().loads).toBe(1);
  await h.runtime.shutdown();
  const absent = harness(
    plan([
      { id: "declaration" },
      { id: "base", entries: [extension()], dependencies: [capabilityDependency({ capabilityId: "absent", contractVersion: "opaque" })] },
    ]),
  );
  await absent.runtime.refresh();
  expect((await absent.runtime.demand(capability, signal())).success).toBe(false);
  expect(absent.counts().loads).toBe(0);
  await absent.runtime.shutdown();
});

test("missing and self required dependencies block before load; optional does not force lazy activation", async () => {
  for (const dependency of [pluginDependency("missing"), pluginDependency("base"), capabilityDependency()]) {
    const h = harness(plan([{ id: "base", entries: [extension()], dependencies: [dependency] }]));
    await h.runtime.refresh();
    expect((await h.runtime.demand(capability, signal())).success).toBe(false);
    expect(h.counts().loads).toBe(0);
    await h.runtime.shutdown();
  }
  const h = harness(
    plan([
      { id: "base", entries: [extension()], dependencies: [pluginDependency("lazy", false)] },
      { id: "lazy", entries: [extension("lazy", [], [])] },
    ]),
  );
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect(h.counts().loads).toBe(1);
  await h.runtime.shutdown();
});

test("ambiguity fails independent of insertion order", async () => {
  for (const plugins of [
    [
      { id: "a", entries: [extension()] },
      { id: "b", entries: [extension()] },
    ],
    [
      { id: "b", entries: [extension()] },
      { id: "a", entries: [extension()] },
    ],
  ]) {
    const h = harness(plan(plugins));
    await h.runtime.refresh();
    expect((await h.runtime.demand(capability, signal())).success).toBe(false);
    expect(h.counts().loads).toBe(0);
    await h.runtime.shutdown();
  }
});

function delayed() {
  const begun = deferred<ActivationContext>();
  const completion = deferred<Result<ActivatedInstance, ActivationFailure>>();
  let cleanup = 0;
  const instance: ActivatedInstance = {
    async cleanup() {
      cleanup++;
      return { success: true, data: undefined };
    },
  };
  const h = harness(undefined, {
    async activate(context) {
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: null };
        },
      });
      begun.resolve(context);
      return completion.promise;
    },
  });
  return { ...h, begun, completion, instance, cleanup: () => cleanup };
}

test("one cancelled caller does not cancel another activation lease", async () => {
  const h = delayed();
  await h.runtime.refresh();
  const first = signal();
  const one = h.runtime.demand(capability, first);
  const two = h.runtime.demand(capability, signal());
  const context = await h.begun.promise;
  first.cancel();
  expect((await one).success).toBe(false);
  expect(context.cancellation.cancelled).toBe(false);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  h.completion.resolve({ success: true, data: h.instance });
  expect((await two).success).toBe(true);
  expect(h.counts().activations).toBe(1);
  await h.runtime.shutdown();
  expect(h.cleanup()).toBe(1);
});

test("last lease abandonment cancels old identity and later demand gets a fresh generation", async () => {
  const h = delayed();
  await h.runtime.refresh();
  const caller = signal();
  const old = h.runtime.demand(capability, caller);
  const context = await h.begun.promise;
  caller.cancel();
  await old;
  expect(context.cancellation.cancelled).toBe(true);
  expect(h.runtime.snapshots()[0]?.generation.generationId).not.toBe(context.generation.generationId);
  h.completion.resolve({ success: true, data: h.instance });
  await flush();
  expect(h.cleanup()).toBe(1);
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect(h.counts().activations).toBe(2);
  await h.runtime.shutdown();
});

test("shutdown closes admission synchronously and cleans late instance and late resources once", async () => {
  const h = delayed();
  await h.runtime.refresh();
  const demand = h.runtime.demand(capability, signal());
  const context = await h.begun.promise;
  const stopping = h.runtime.shutdown();
  expect((await h.runtime.demand(capability, signal())).success).toBe(false);
  expect(context.cancellation.cancelled).toBe(true);
  context.resources.own(h.instance);
  context.resources.own(h.instance);
  h.completion.resolve({ success: true, data: h.instance });
  await stopping;
  await demand;
  await flush();
  expect(h.cleanup()).toBe(1);
  expect(h.runtime.snapshots().every((snapshot) => snapshot.state !== "ready")).toBe(true);
  expect(h.clock.pending).toBe(0);
});

test("partial initialization failure attempts every owned disposer despite throw and typed failure", async () => {
  const calls: number[] = [];
  const h = harness(undefined, {
    async activate(context) {
      context.resources.own({
        async cleanup() {
          calls.push(1);
          throw new Error("secret");
        },
      });
      context.resources.own({
        async cleanup() {
          calls.push(2);
          return { success: false, error: { code: "cleanup-failed" } };
        },
      });
      context.resources.own({
        async cleanup() {
          calls.push(3);
          return { success: true, data: undefined };
        },
      });
      throw new Error("private-config");
    },
  });
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(false);
  expect(calls).toEqual([1, 2, 3]);
  expect(JSON.stringify(h.events)).not.toContain("private-config");
  expect(JSON.stringify(h.diagnostics)).not.toContain("secret");
  await h.runtime.shutdown();
  expect(calls).toEqual([1, 2, 3]);
});

test("controlled activation timeout withdraws provisional providers and cleans late success", async () => {
  const h = delayed();
  await h.runtime.refresh();
  const pending = h.runtime.demand(capability, signal());
  await h.begun.promise;
  h.clock.advance(101);
  expect(await pending).toEqual({ success: false, error: { code: "timeout" } });
  h.completion.resolve({ success: true, data: h.instance });
  await flush();
  expect(h.cleanup()).toBe(1);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
});
