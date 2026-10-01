import { expect, test } from "bun:test";
import type {
  ActivatedInstance,
  ActivationContext,
  ActivationFailure,
  InvocationContext,
  PlanSource,
  Provider,
  ResolvedPlan,
  Result,
  SourceFailure,
} from "@pylons/contracts";
import { createEventEmitter } from "../src/eventemitter.js";
import { capability, deferred, extension, flush, harness, plan, request, signal } from "./fixtures.js";

function externalFixture(tenant = "a", securityRequired = true) {
  const initial = plan([], "r1", tenant);
  let result: Result<ResolvedPlan, SourceFailure> = { success: true, data: initial };
  let calls = 0;
  const security = { capabilityId: "security", contractVersion: "opaque" };
  const hints = createEventEmitter<{ readonly scope: { readonly hostId: string; readonly tenantId: string } }>();
  const provider: Provider = {
    async invoke() {
      calls++;
      return { success: true, data: null };
    },
  };
  const h = harness(
    initial,
    {},
    {
      source: {
        async read() {
          return result;
        },
        onInvalidation: hints.event,
      },
      hostCapabilities: [capability, security].map((value) => ({ capability: value, isReady: () => true, provider })),
      securityStartupCapabilities: securityRequired ? [security] : [],
    },
  );
  return {
    ...h,
    security,
    hints,
    calls: () => calls,
    setResult: (value: Result<ResolvedPlan, SourceFailure>) => {
      result = value;
    },
  };
}

function sourceControl(initial = plan([])) {
  let authorized = true;
  const port: PlanSource = {
    async read() {
      return authorized ? { success: true, data: initial } : { success: false, error: { code: "unauthorized" } };
    },
  };
  return {
    port,
    setAuthorized: (value: boolean) => {
      authorized = value;
    },
  };
}

function pendingStartup() {
  let count = 0;
  let cleaned = 0;
  const entered = deferred<ActivationContext>();
  const completion = deferred<Result<ActivatedInstance, ActivationFailure>>();
  const instance = (): ActivatedInstance => ({
    async cleanup() {
      cleaned++;
      return { success: true, data: undefined };
    },
  });
  return {
    entered,
    completion,
    instance,
    cleaned: () => cleaned,
    async activate(context: ActivationContext): Promise<Result<ActivatedInstance, ActivationFailure>> {
      count++;
      context.providers.register(capability, {
        async invoke() {
          return { success: true, data: null };
        },
      });
      if (count !== 1) return { success: true, data: instance() };
      entered.resolve(context);
      return completion.promise;
    },
  };
}

test("source revocation prevents pending startup from succeeding in a recovered external security epoch", async () => {
  const selected = plan([{ id: "base", entries: [{ ...extension(), activation: { kind: "startup" } }] }]);
  const source = sourceControl(selected);
  const pending = pendingStartup();
  const security = { capabilityId: "security", contractVersion: "opaque" };
  const provider: Provider = {
    async invoke() {
      return { success: true, data: null };
    },
  };
  const h = harness(
    selected,
    { activate: pending.activate },
    {
      source: source.port,
      securityStartupCapabilities: [security],
      hostCapabilities: [{ capability: security, isReady: () => true, provider }],
    },
  );
  await h.runtime.refresh();
  const old = h.runtime.startup();
  const context = await pending.entered.promise;
  source.setAuthorized(false);
  await h.runtime.refresh();
  expect(context.cancellation.cancelled).toBe(true);
  expect((await h.runtime.demand(security, signal())).success).toBe(false);
  expect((await h.runtime.invoke(security, null, request())).success).toBe(false);
  source.setAuthorized(true);
  await h.runtime.refresh();
  pending.completion.resolve({ success: true, data: pending.instance() });
  expect((await old).success).toBe(false);
  await flush();
  expect(pending.cleaned()).toBe(1);
  expect(h.events.some((value) => value.kind === "provider-changed" && value.ready)).toBe(false);
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(h.counts().activations).toBe(2);
  await h.runtime.shutdown();
  expect(pending.cleaned()).toBe(2);
  expect(h.clock.pending).toBe(0);
});

test.each([false, true])("unauthorized empty plan revokes external admission until valid acceptance (security requirement %s)", async (securityRequired) => {
  const h = externalFixture("a", securityRequired);
  await h.runtime.refresh();
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  h.setResult({ success: false, error: { code: "unauthorized" } });
  expect((await h.runtime.refresh()).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(false);
  for (const value of [capability, h.security]) {
    expect((await h.runtime.demand(value, signal())).success).toBe(false);
    expect((await h.runtime.invoke(value, null, request())).success).toBe(false);
  }
  h.setResult({ success: false, error: { code: "unavailable" } });
  h.hints.fire({ scope: plan([]).inventory.scope });
  await flush();
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  h.setResult({ success: true, data: plan([], "wrong", "other") });
  expect((await h.runtime.refresh()).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(false);
  expect(h.calls()).toBe(1);
  expect(h.clock.now()).toBe(0);
  h.setResult({ success: true, data: plan([], "accepted") });
  expect((await h.runtime.refresh()).success).toBe(true);
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(h.calls()).toBe(2);
  await h.runtime.shutdown();
  h.hints.dispose();
});

test("one scoped revocation cannot close another tenant coordinator's external admission", async () => {
  const a = externalFixture("a");
  const b = externalFixture("b");
  await Promise.all([a.runtime.refresh(), b.runtime.refresh()]);
  a.setResult({ success: false, error: { code: "unauthorized" } });
  await a.runtime.refresh();
  expect((await a.runtime.startup()).success).toBe(false);
  expect((await a.runtime.invoke(capability, null, request())).success).toBe(false);
  expect((await b.runtime.startup()).success).toBe(true);
  expect((await b.runtime.demand(capability, signal())).success).toBe(true);
  expect((await b.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(a.calls()).toBe(0);
  expect(b.calls()).toBe(1);
  await Promise.all([a.runtime.shutdown(), b.runtime.shutdown()]);
  a.hints.dispose();
  b.hints.dispose();
});

test("revocation cancels an external invocation and rejects its late result even after authorized recovery", async () => {
  const source = sourceControl();
  let calls = 0;
  const started = deferred<InvocationContext>();
  const completion = deferred<Result<null, { readonly code: "provider-failed" }>>();
  const h = harness(
    plan([]),
    {},
    {
      source: source.port,
      hostCapabilities: [
        {
          capability,
          isReady: () => true,
          provider: {
            async invoke(_input, context) {
              calls++;
              if (calls !== 1) return { success: true, data: null };
              started.resolve(context);
              return completion.promise;
            },
          },
        },
      ],
    },
  );
  await h.runtime.refresh();
  const old = h.runtime.invoke(capability, null, request());
  const context = await started.promise;
  source.setAuthorized(false);
  await h.runtime.refresh();
  expect(context.cancellation.cancelled).toBe(true);
  expect((await h.runtime.startup()).success).toBe(false);
  source.setAuthorized(true);
  await h.runtime.refresh();
  completion.resolve({ success: true, data: null });
  expect((await old).success).toBe(false);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(calls).toBe(2);
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
});

test("revocation during per-call authorization cannot publish or invoke in a recovered admission epoch", async () => {
  const source = sourceControl();
  let decisions = 0;
  let calls = 0;
  const started = deferred<InvocationContext>();
  const decision = deferred<{ readonly kind: "allow" }>();
  const h = harness(
    plan([]),
    {},
    {
      source: source.port,
      authority: {
        async authorize(value) {
          decisions++;
          if (decisions !== 1) return { kind: "allow" };
          started.resolve(value.invocation);
          return decision.promise;
        },
      },
      hostCapabilities: [
        {
          capability,
          isReady: () => true,
          provider: {
            async invoke() {
              calls++;
              return { success: true, data: null };
            },
          },
        },
      ],
    },
  );
  await h.runtime.refresh();
  const old = h.runtime.invoke(capability, null, request());
  const context = await started.promise;
  source.setAuthorized(false);
  await h.runtime.refresh();
  expect(context.cancellation.cancelled).toBe(true);
  source.setAuthorized(true);
  await h.runtime.refresh();
  decision.resolve({ kind: "allow" });
  expect((await old).success).toBe(false);
  expect(calls).toBe(0);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(calls).toBe(1);
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
});
