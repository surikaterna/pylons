import type { Cancellation, Clock, InvocationContext, InvocationFailure, JsonValue, Provider, Result } from "@pylons/contracts";
import { parseResolvedPlan } from "@pylons/contracts";
import { createRuntime, createVersionOwnership, type Runtime, type RuntimeOptions } from "@pylons/core";

class Signal implements Cancellation {
  cancelled = false;
  private readonly listeners = new Set<() => void>();
  onCancel(listener: () => void) {
    if (this.cancelled) listener();
    else this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
  cancel(): void {
    this.cancelled = true;
    for (const listener of [...this.listeners]) listener();
    this.listeners.clear();
  }
}

const clock: Clock = {
  now: () => performance.timeOrigin + performance.now(),
  schedule(delay, callback) {
    const timer = setTimeout(callback, delay);
    return { dispose: () => clearTimeout(timer) };
  },
};

function emptyPlan() {
  const scope = { hostId: "timeout-probe", tenantId: "a" };
  const until = clock.now() + 10000;
  const parsed = parseResolvedPlan({
    schemaVersion: 1,
    inventory: { schemaVersion: 1, scope, revision: "r1", validity: { freshUntil: until, authorizedUntil: until }, installations: [] },
    definitions: [],
    configs: [],
    provenance: { sourceId: "private-probe", revision: "r1", authorizationId: "verified-probe" },
  });
  if (!parsed.success) throw new Error("invalid-probe-plan");
  return parsed.data;
}

function cooperativeProvider() {
  let context: InvocationContext | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let finish: ((result: Result<JsonValue, InvocationFailure>) => void) | undefined;
  let cancellationObserved = false;
  let active = false;
  let fallbackCleanups = 0;
  const provider: Provider = {
    invoke(_input, request) {
      context = request;
      active = true;
      interval = setInterval(() => {}, 100);
      return new Promise((resolve) => {
        finish = resolve;
        request.cancellation.onCancel(() => {
          cancellationObserved = true;
          active = false;
          clearInterval(interval);
          resolve({ success: false, error: { code: "cancelled" } });
        });
      });
    },
  };
  return {
    provider,
    state: () => ({ cancellationObserved, providerCancelled: context?.cancellation.cancelled ?? false, active, fallbackCleanups }),
    dispose() {
      if (active) fallbackCleanups++;
      active = false;
      clearInterval(interval);
      finish?.({ success: false, error: { code: "cancelled" } });
    },
  };
}

function options(plan: ReturnType<typeof emptyPlan>, provider: Provider, invocation: number): RuntimeOptions {
  const capability = { capabilityId: "validation", contractVersion: "1" };
  const security = { capabilityId: "credential-policy", contractVersion: "1" };
  const securityProvider: Provider = {
    async invoke() {
      return { success: true, data: null };
    },
  };
  return {
    context: { scope: plan.inventory.scope, authorizationId: "verified-probe" },
    host: "cli",
    hostContractVersion: "1",
    source: {
      async read() {
        return { success: true, data: plan };
      },
    },
    loader: {
      async load() {
        return { success: false, error: { code: "denied" } };
      },
    },
    policy: {
      async evaluate() {
        return { kind: "allow" };
      },
    },
    authority: {
      async authorize() {
        return { kind: "allow" };
      },
    },
    clock,
    observer: { observe() {} },
    diagnostics: { write() {} },
    bounds: { source: 1000, policy: 1000, load: 1000, activation: 1000, invocation, replacement: 1000, cleanup: 1000 },
    supportedContributionKinds: [],
    securityStartupCapabilities: [security],
    hostCapabilities: [
      { capability, provider, isReady: () => true },
      { capability: security, provider: securityProvider, isReady: () => true },
    ],
    versionOwnership: createVersionOwnership(),
  };
}

type Mode = "timeout-caller" | "timeout-shutdown" | "shutdown";

function released(state: ReturnType<ReturnType<typeof cooperativeProvider>["state"]>): boolean {
  return state.cancellationObserved && state.providerCancelled && !state.active && state.fallbackCleanups === 0;
}

async function exercise(mode: Mode, runtime: Runtime, caller: Signal, cooperative: ReturnType<typeof cooperativeProvider>) {
  const invocation = runtime.invoke({ capabilityId: "validation", contractVersion: "1" }, null, {
    principal: { subjectId: "probe-user" },
    credential: { reference: "probe-reference" },
    transaction: { id: "probe-transaction" },
    cancellation: caller,
  });
  if (mode === "shutdown") {
    await Bun.sleep(5);
    const beforeExternal = cooperative.state();
    const shutdown = await runtime.shutdown();
    const result = await invocation;
    return { result, shutdown, beforeExternal, promptCancellation: false, passed: !result.success && beforeExternal.active && released(cooperative.state()) };
  }
  const result = await invocation;
  const beforeExternal = cooperative.state();
  const promptCancellation = released(beforeExternal) && !caller.cancelled;
  const expectedFailure = !result.success && result.error.code === "provider-failed";
  if (mode === "timeout-caller") caller.cancel();
  else await runtime.shutdown();
  return { result, beforeExternal, promptCancellation, passed: expectedFailure && promptCancellation && released(cooperative.state()) };
}

async function probe(mode: Mode) {
  const cooperative = cooperativeProvider();
  const caller = new Signal();
  const runtime = createRuntime(options(emptyPlan(), cooperative.provider, mode === "shutdown" ? 1000 : 20));
  let receipt: Awaited<ReturnType<typeof exercise>> | undefined;
  try {
    const refreshed = await runtime.refresh();
    const startup = await runtime.startup();
    if (!refreshed.success || !startup.success) throw new Error("probe-startup-failed");
    receipt = await exercise(mode, runtime, caller, cooperative);
  } finally {
    cooperative.dispose();
    await runtime.shutdown();
  }
  const final = cooperative.state();
  console.log(JSON.stringify({ mode, ...receipt, final, forcedKill: false }));
  return receipt.passed && released(final);
}

const control = await probe("shutdown");
const caller = await probe("timeout-caller");
const shutdown = await probe("timeout-shutdown");
if (!control || !caller || !shutdown) process.exitCode = 1;
