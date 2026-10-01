import type { Cancellation, Clock, Disposable, ResolvedPlan, VerifiedContext } from "@pylons/contracts";
import { ReadCancellation } from "../src/cancellation.js";
import { createFetchTransport } from "../src/fetch.js";
import type { HttpSourceOptions } from "../src/types.js";

export const context: VerifiedContext = { scope: { hostId: "host", tenantId: "tenant-a" }, authorizationId: "grant-a" };
export const definition = { pluginId: "metadata", definitionVersion: "1.0.0" };
export function plan(scope = context, revision = "z", until = 1500): ResolvedPlan {
  return {
    schemaVersion: 1,
    inventory: {
      schemaVersion: 1,
      scope: scope.scope,
      revision,
      validity: { freshUntil: until, authorizedUntil: until },
      installations: [{ definition, enabled: true, selectedExtensions: [], operatorBindings: [] }],
    },
    definitions: [{ schemaVersion: 1, identity: { ...definition, name: "Metadata" }, contributions: [], extensions: [], dependencies: [] }],
    configs: [{ schemaVersion: 1, scope: scope.scope, revision, definition, values: { secret: "must-not-leak" } }],
    provenance: { sourceId: "fixture", revision, authorizationId: scope.authorizationId },
  };
}
export class TestClock implements Clock {
  time = 1000;
  readonly timers = new Set<() => void>();
  now(): number {
    return this.time;
  }
  schedule(_delay: number, callback: () => void): Disposable {
    this.timers.add(callback);
    return { dispose: () => this.timers.delete(callback) };
  }
  expire(): void {
    for (const callback of [...this.timers]) callback();
  }
}
export class Cancel implements Cancellation {
  private readonly own = new ReadCancellation();
  subscriptions = 0;
  get cancelled(): boolean {
    return this.own.cancelled;
  }
  readonly onCancel = (listener: () => void): Disposable => {
    this.subscriptions++;
    const subscription = this.own.onCancel(listener);
    return {
      dispose: () => {
        this.subscriptions--;
        subscription.dispose();
      },
    };
  };
  cancel(): void {
    this.own.cancel();
  }
}
export function options(url: string, clock = new TestClock()): HttpSourceOptions {
  const origin = new URL(url).origin;
  return {
    transport: createFetchTransport(),
    clock,
    maxResponseBytes: 4096,
    timeoutMilliseconds: 500,
    resolveEndpoint: (request) => ({ url, headers: { "x-tenant": request.context.scope.tenantId, "x-authorization": request.context.authorizationId } }),
    authorization: {
      async authorize(request, endpoint) {
        if (new URL(endpoint.url).origin !== origin || request.context.authorizationId === "revoked")
          return { success: false, error: { code: "unauthorized" } };
        return { success: true, data: { sourceId: "fixture", authorizedUntil: 2000, maxFreshnessMilliseconds: 1000 } };
      },
    },
  };
}
export function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
