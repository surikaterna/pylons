import type {
  ActivatedInstance,
  ActivationContext,
  ActivationFailure,
  Cancellation,
  Disposable,
  InvocationContext,
  InvocationFailure,
  JsonValue,
  Provider,
  Result,
} from "@pylons/contracts";
import type { InvocationAuthority } from "../src/types.js";
import { capability, harness, plan, TestClock } from "./fixtures.js";

const allowAuthority: InvocationAuthority = {
  async authorize() {
    return { kind: "allow" };
  },
};
const securityProvider: Provider = {
  async invoke() {
    return { success: true, data: null };
  },
};

export class TrackedSignal implements Cancellation {
  cancelled = false;
  private readonly listeners = new Set<() => void>();
  get subscriptions(): number {
    return this.listeners.size;
  }
  onCancel(listener: () => void): Disposable {
    if (this.cancelled) listener();
    else this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const listener of [...this.listeners]) listener();
    this.listeners.clear();
  }
}

export function pendingOperation<T>(clock: TestClock, cancelledValue?: T, onCancel = () => {}) {
  let context: InvocationContext | undefined;
  let timer: Disposable | undefined;
  let subscription: Disposable | undefined;
  let complete: ((value: T) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  let active = false;
  let cancellations = 0;
  function release(): void {
    active = false;
    timer?.dispose();
    subscription?.dispose();
  }
  return {
    start(request: InvocationContext): Promise<T> {
      context = request;
      active = true;
      timer = clock.schedule(10000, () => {});
      return new Promise((resolve, fail) => {
        complete = resolve;
        reject = fail;
        subscription = request.cancellation.onCancel(() => {
          cancellations++;
          onCancel();
          if (cancelledValue === undefined) return;
          release();
          resolve(cancelledValue);
        });
      });
    },
    finish(value: T): void {
      if (!complete) throw new Error("operation-not-started");
      release();
      complete(value);
    },
    fail(): void {
      if (!reject) throw new Error("operation-not-started");
      release();
      reject(new Error("private-operation-failure"));
    },
    state: () => ({ active, cancellations, cancelled: context?.cancellation.cancelled ?? false }),
  };
}

export function invocationHarness(provider: Provider, clock = new TestClock(), authority?: InvocationAuthority) {
  const security = { capabilityId: "credential-policy", contractVersion: "opaque" };
  const initial = plan([]);
  const sourceState = { authorized: true };
  const fixture = harness(
    initial,
    {},
    {
      clock,
      source: {
        async read() {
          return sourceState.authorized ? { success: true, data: initial } : { success: false, error: { code: "unauthorized" } };
        },
      },
      authority: authority ?? allowAuthority,
      securityStartupCapabilities: [security],
      hostCapabilities: [
        { capability, provider, isReady: () => true },
        { capability: security, provider: securityProvider, isReady: () => true },
      ],
    },
  );
  return {
    ...fixture,
    clock,
    revoke: () => {
      sourceState.authorized = false;
    },
    restore: () => {
      sourceState.authorized = true;
    },
  };
}

export async function start(fixture: ReturnType<typeof invocationHarness>): Promise<void> {
  if (!(await fixture.runtime.refresh()).success || !(await fixture.runtime.startup()).success) throw new Error("fixture-startup-failed");
}

export function countedProvider(result: Result<JsonValue, InvocationFailure>) {
  let entries = 0;
  const provider: Provider = {
    async invoke() {
      entries++;
      return result;
    },
  };
  return { provider, entries: () => entries };
}

export function providerActivation(provider: Provider): (context: ActivationContext) => Promise<Result<ActivatedInstance, ActivationFailure>> {
  return async (context: ActivationContext) => {
    const registered = context.providers.register(capability, provider);
    if (!registered.success) return { success: false, error: { code: "initialization-failed" } };
    const instance: ActivatedInstance = {
      async cleanup() {
        registered.data.dispose();
        return { success: true, data: undefined };
      },
    };
    context.resources.own(instance);
    return { success: true, data: instance };
  };
}
