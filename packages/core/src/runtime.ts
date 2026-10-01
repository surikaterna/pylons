import type { Cancellation, Capability, InvocationContext, JsonValue } from "@pylons/contracts";
import { Coordinator } from "./coordinator.js";
import { guardedInvoke } from "./invocation.js";
import { createObservation } from "./observation.js";
import { RefreshController } from "./refresh.js";
import type { Runtime, RuntimeOptions } from "./types.js";

export class RuntimeConfigurationError extends Error {
  override readonly name = "RuntimeConfigurationError";
  constructor() {
    super("Invalid runtime configuration");
  }
}

function validateOptions(options: RuntimeOptions): void {
  const names: readonly (keyof RuntimeOptions["bounds"])[] = ["source", "policy", "load", "activation", "invocation", "replacement", "cleanup"];
  if (!options.bounds || names.some((key) => !Number.isFinite(options.bounds[key]) || options.bounds[key] <= 0)) throw new RuntimeConfigurationError();
  if (
    !options.source ||
    !options.loader ||
    !options.policy ||
    !options.authority ||
    !options.clock ||
    !options.observer ||
    !options.diagnostics ||
    !options.securityStartupCapabilities ||
    !options.hostCapabilities ||
    !options.versionOwnership
  )
    throw new RuntimeConfigurationError();
}

export function createRuntime(input: RuntimeOptions): Runtime {
  validateOptions(input);
  const options = snapshotOptions(input);
  const observation = createObservation(options);
  const coordinator = new Coordinator(options, observation);
  const refresh = new RefreshController(options, coordinator, observation);
  return {
    onState: observation.event,
    refresh: () => refresh.refresh(),
    metadata: () => metadata(coordinator, options),
    startup: async () => ((await coordinator.startup()) ? { success: true, data: undefined } : { success: false, error: { code: "blocked" } }),
    demand: (capability, cancellation) => demand(coordinator, capability, cancellation),
    invoke: (capability, input, context) => invoke(coordinator, options, capability, input, context),
    snapshots: () => coordinator.snapshots(),
    shutdown: async () => {
      const cleanup = coordinator.shutdown();
      refresh.close();
      const success = await cleanup;
      observation.dispose();
      return success ? { success: true, data: undefined } : { success: false, error: { code: "cleanup-failed" } };
    },
  };
}

function snapshotOptions(options: RuntimeOptions): RuntimeOptions {
  return Object.freeze({
    ...options,
    context: Object.freeze({ ...options.context, scope: Object.freeze({ ...options.context.scope }) }),
    bounds: Object.freeze({ ...options.bounds }),
    supportedContributionKinds: Object.freeze([...options.supportedContributionKinds]),
    securityStartupCapabilities: Object.freeze(options.securityStartupCapabilities.map((capability) => Object.freeze({ ...capability }))),
    hostCapabilities: Object.freeze([...options.hostCapabilities]),
  });
}

function metadata(coordinator: Coordinator, options: RuntimeOptions) {
  const seen = new Set<string>();
  return [...coordinator.generations.values()]
    .filter((generation) => {
      const id = generation.selection.definition.identity.pluginId;
      if (generation.closed || !generation.selection.eligible || !coordinator.current(generation) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((generation) => ({
      pluginId: generation.selection.definition.identity.pluginId,
      definitionVersion: generation.selection.definition.identity.definitionVersion,
      contributions: generation.selection.definition.contributions.filter((entry) => options.supportedContributionKinds.includes(entry.kind)),
    }));
}

async function demand(coordinator: Coordinator, capability: Capability, cancellation: Cancellation): ReturnType<Runtime["demand"]> {
  if (coordinator.closed) return { success: false, error: { code: "closed" } };
  if (cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
  const generation = coordinator.resolve(capability);
  if (!generation) return coordinator.providerReady(capability) ? { success: true, data: undefined } : { success: false, error: { code: "unavailable" } };
  return generation.demand(cancellation);
}

async function invoke(
  coordinator: Coordinator,
  options: RuntimeOptions,
  capability: Capability,
  input: JsonValue,
  context: InvocationContext,
): ReturnType<Runtime["invoke"]> {
  const admission = coordinator.admission;
  const generation = coordinator.resolve(capability);
  return guardedInvoke(options, capability, input, context, {
    cancellations: generation ? [coordinator.lifetime, admission, generation.lifetime] : [coordinator.lifetime, admission],
    ready: () =>
      coordinator.admissionCurrent(admission) && coordinator.securityReady() && coordinator.providerReady(capability) && (!generation || generation.ready()),
    admit: () => coordinator.admit(capability),
    provider: () => coordinator.provider(capability),
  });
}
