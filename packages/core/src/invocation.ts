import type { Cancellation, Capability, InvocationContext, InvocationFailure, JsonValue, Provider, Result } from "@pylons/contracts";
import { bounded } from "./boundary.js";
import { CancellationSource } from "./cancellation.js";
import type { RuntimeOptions } from "./types.js";

export interface InvocationGuard {
  readonly cancellations: readonly Cancellation[];
  ready(): boolean;
  admit(): Promise<boolean>;
  provider(): Provider | undefined;
}

export async function guardedInvoke(
  options: RuntimeOptions,
  capability: Capability,
  input: JsonValue,
  request: InvocationContext,
  guard: InvocationGuard,
): Promise<Result<JsonValue, InvocationFailure>> {
  const cancellation = new CancellationSource([request.cancellation, ...guard.cancellations]);
  try {
    return await invoke(options, capability, input, request, guard, cancellation);
  } finally {
    cancellation.dispose();
  }
}

async function invoke(
  options: RuntimeOptions,
  capability: Capability,
  input: JsonValue,
  request: InvocationContext,
  guard: InvocationGuard,
  cancellation: Cancellation,
): Promise<Result<JsonValue, InvocationFailure>> {
  const context: InvocationContext = Object.freeze({
    ...request,
    cancellation,
    principal: Object.freeze({ ...request.principal }),
    credential: Object.freeze({ ...request.credential }),
    transaction: Object.freeze({ ...request.transaction }),
  });
  if (context.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
  if (!guard.ready() || !(await guard.admit())) return { success: false, error: { code: "unavailable" } };
  const authorization = await bounded(
    () => options.authority.authorize({ verifiedContext: options.context, capability, invocation: context }),
    options.clock,
    options.bounds.policy,
    context.cancellation,
  );
  if (authorization.kind !== "value" || authorization.value.kind !== "allow")
    return { success: false, error: { code: context.cancellation.cancelled ? "cancelled" : "denied" } };
  if (!guard.ready() || !(await guard.admit()) || context.cancellation.cancelled) return { success: false, error: { code: "unavailable" } };
  const provider = guard.provider();
  if (!provider) return { success: false, error: { code: "unavailable" } };
  const result = await bounded(() => provider.invoke(input, context), options.clock, options.bounds.invocation, context.cancellation);
  if (!guard.ready()) return { success: false, error: { code: "unavailable" } };
  if (result.kind !== "value") return { success: false, error: { code: context.cancellation.cancelled ? "cancelled" : "provider-failed" } };
  return result.value;
}
