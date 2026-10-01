import { expect, test } from "bun:test";
import type { AdmissionDecision, ResolvedPlan, Result, SourceFailure } from "@pylons/contracts";
import { capability, deferred, flush, harness, plan, request, signal } from "./fixtures.js";

test("shutdown during source and selection-policy awaits releases timers and prevents publication", async () => {
  const sourceStarted = deferred<undefined>();
  const sourceResult = deferred<Result<ResolvedPlan, SourceFailure>>();
  const h = harness(
    undefined,
    {},
    {
      source: {
        async read() {
          sourceStarted.resolve(undefined);
          return sourceResult.promise;
        },
      },
    },
  );
  const read = h.runtime.refresh();
  await sourceStarted.promise;
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
  sourceResult.resolve({ success: true, data: plan() });
  expect((await read).success).toBe(false);
  expect(h.runtime.snapshots()).toHaveLength(0);
  const policyStarted = deferred<undefined>();
  const policyResult = deferred<AdmissionDecision>();
  const policy = harness(undefined, {
    async policy() {
      policyStarted.resolve(undefined);
      return policyResult.promise;
    },
  });
  const reading = policy.runtime.refresh();
  await policyStarted.promise;
  await policy.runtime.shutdown();
  expect(policy.clock.pending).toBe(0);
  policyResult.resolve({ kind: "allow" });
  expect((await reading).success).toBe(false);
  expect(policy.runtime.snapshots()).toHaveLength(0);
});

test("shutdown during authoritative authorization does not reach provider or retain invocation timer", async () => {
  const authorized = deferred<{ readonly kind: "allow" }>();
  const started = deferred<undefined>();
  const h = harness(
    undefined,
    {},
    {
      authority: {
        async authorize() {
          started.resolve(undefined);
          return authorized.promise;
        },
      },
    },
  );
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  const invoke = h.runtime.invoke(capability, null, request());
  await started.promise;
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
  authorized.resolve({ kind: "allow" });
  expect((await invoke).success).toBe(false);
  expect(h.counts().calls).toBe(0);
});

test("shutdown during provider invocation cancels request-local context and rejects late result", async () => {
  const response = deferred<Result<null, { readonly code: "provider-failed" }>>();
  const started = deferred<undefined>();
  let cancelled = false;
  const h = harness(undefined, {
    async activate(context) {
      context.providers.register(capability, {
        async invoke(_input, invocation) {
          const subscription = invocation.cancellation.onCancel(() => {
            cancelled = true;
          });
          started.resolve(undefined);
          try {
            return await response.promise;
          } finally {
            subscription.dispose();
          }
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
  });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  const invoke = h.runtime.invoke(capability, null, request());
  await started.promise;
  await h.runtime.shutdown();
  expect(cancelled).toBe(true);
  expect(h.clock.pending).toBe(0);
  response.resolve({ success: true, data: null });
  expect((await invoke).success).toBe(false);
  await flush();
});
