import { expect, test } from "bun:test";
import type { ActivatedInstance, ActivationContext, ActivationFailure, Result } from "@pylons/contracts";
import { capability, deferred, extension, flush, harness, plan, request, signal } from "./fixtures.js";

test("startup ownership keeps a pending flight alive after the last demand cancels", async () => {
  const entered = deferred<ActivationContext>();
  const completion = deferred<Result<ActivatedInstance, ActivationFailure>>();
  const h = harness(plan([{ id: "base", entries: [{ ...extension(), activation: { kind: "startup" } }] }]), {
    async activate(context) {
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: null };
        },
      });
      entered.resolve(context);
      return completion.promise;
    },
  });
  await h.runtime.refresh();
  const startup = h.runtime.startup();
  const context = await entered.promise;
  const caller = signal();
  const demand = h.runtime.demand(capability, caller);
  caller.cancel();
  expect((await demand).success).toBe(false);
  expect(context.cancellation.cancelled).toBe(false);
  completion.resolve({
    success: true,
    data: {
      async cleanup() {
        return { success: true, data: undefined };
      },
    },
  });
  expect((await startup).success).toBe(true);
  expect(h.counts().activations).toBe(1);
  await h.runtime.shutdown();
});

test("cleanup timeout does not skip other disposers and shutdown reports typed failure", async () => {
  const calls: number[] = [];
  const never = deferred<Result<undefined, { readonly code: "cleanup-failed" }>>();
  const h = harness(undefined, {
    async activate(context) {
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: null };
        },
      });
      const hanging = {
        async cleanup() {
          calls.push(1);
          return never.promise;
        },
      };
      context.resources.own(hanging);
      context.resources.own(hanging);
      context.resources.own({
        async cleanup() {
          calls.push(2);
          return { success: true, data: undefined };
        },
      });
      return {
        success: true,
        data: {
          async cleanup() {
            calls.push(3);
            return { success: true, data: undefined };
          },
        },
      };
    },
  });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  const stop = h.runtime.shutdown();
  expect(calls).toEqual([1, 2, 3]);
  h.clock.advance(101);
  expect(await stop).toEqual({ success: false, error: { code: "cleanup-failed" } });
  expect(h.runtime.snapshots()[0]?.failureCode).toBe("cleanup-failed");
  expect(h.clock.pending).toBe(0);
});

test("successful configuration replacement actually changes provider behavior", async () => {
  const h = harness(undefined, {
    async activate(context) {
      let configuration = context.configuration;
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: configuration.values };
        },
      });
      return {
        success: true,
        data: {
          async replaceConfiguration(candidate) {
            configuration = candidate;
            return { kind: "applied", appliedRevision: candidate.revision };
          },
          async cleanup() {
            return { success: true, data: undefined };
          },
        },
      };
    },
  });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  expect(await h.runtime.invoke(capability, null, request())).toEqual({ success: true, data: { minimum: 3 } });
  h.setPlan(plan([{ id: "base", entries: [extension()], value: 8 }], "r2"));
  await h.runtime.refresh();
  expect(await h.runtime.invoke(capability, null, request())).toEqual({ success: true, data: { minimum: 8 } });
  expect(h.runtime.snapshots()[0]?.generation.appliedRevision).toBe("r2");
  await h.runtime.shutdown();
});

test("policy change during initialization closes the acquired instance without publication", async () => {
  let allowed = true;
  const entered = deferred<ActivationContext>();
  const finish = deferred<Result<ActivatedInstance, ActivationFailure>>();
  let cleaned = 0;
  const h = harness(undefined, {
    async policy() {
      return allowed ? { kind: "allow" } : { kind: "deny", code: "unauthorized" };
    },
    async activate(context) {
      entered.resolve(context);
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: null };
        },
      });
      return finish.promise;
    },
  });
  await h.runtime.refresh();
  const pending = h.runtime.demand(capability, signal());
  await entered.promise;
  allowed = false;
  finish.resolve({
    success: true,
    data: {
      async cleanup() {
        cleaned++;
        return { success: true, data: undefined };
      },
    },
  });
  expect((await pending).success).toBe(false);
  expect(cleaned).toBe(1);
  expect(h.events.some((event) => event.kind === "provider-changed" && event.ready)).toBe(false);
  await h.runtime.shutdown();
});

test("observer and diagnostics throws cannot alter lifecycle or expose errors", async () => {
  const h = harness(
    undefined,
    {},
    {
      observer: {
        observe() {
          throw new Error("raw-error");
        },
      },
      diagnostics: {
        write() {
          throw new Error("raw-error");
        },
      },
    },
  );
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  h.setPlan(plan(undefined, "rejected", "wrong"));
  expect((await h.runtime.refresh()).success).toBe(false);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect((await h.runtime.shutdown()).success).toBe(true);
});

test("expiry while initialization is pending prevents late readiness and cleans acquired resources", async () => {
  const entered = deferred<ActivationContext>();
  const finish = deferred<Result<ActivatedInstance, ActivationFailure>>();
  let cleaned = 0;
  const h = harness(undefined, {
    async activate(context) {
      entered.resolve(context);
      return finish.promise;
    },
  });
  await h.runtime.refresh();
  const demand = h.runtime.demand(capability, signal());
  const context = await entered.promise;
  h.clock.advance(1000);
  context.resources.own({
    async cleanup() {
      cleaned++;
      return { success: true, data: undefined };
    },
  });
  finish.resolve({ success: false, error: { code: "initialization-failed" } });
  expect((await demand).success).toBe(false);
  await flush();
  expect(cleaned).toBe(1);
  expect(h.runtime.snapshots()[0]?.state).not.toBe("ready");
  await h.runtime.shutdown();
});
