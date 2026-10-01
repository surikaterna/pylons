import type { ArtifactLoader, Host, InvocationContext, JsonValue, OwnedResource, Provider, ProviderRegistrar, Validity } from "@pylons/contracts";
import { cleanupResources } from "./cleanup.js";
import { cancellation, readMetadata } from "./metadata.js";
import { diagnostics } from "./safe-diagnostics.js";
import { bounded } from "./timeout.js";

interface State {
  provider: Provider | undefined;
  invocations: number;
  stopped: boolean;
  readonly resources: OwnedResource[];
}

function registrar(state: State): ProviderRegistrar {
  return {
    register(capability, value) {
      if (state.stopped) return { success: false, error: { code: "closed-generation" } };
      if (capability.capabilityId !== "validation" || capability.contractVersion !== "1") return { success: false, error: { code: "undeclared-provider" } };
      if (state.provider) return { success: false, error: { code: "duplicate-provider" } };
      state.provider = value;
      return {
        success: true,
        data: {
          dispose() {
            state.provider = undefined;
          },
        },
      };
    },
  };
}

export async function activate(origin: string, host: Host, loader: ArtifactLoader) {
  const { plan, request } = await readMetadata(origin, host);
  const config = plan.configs[0];
  if (!config) throw new Error("config-absent");
  const loaded = await bounded(loader.load(request));
  if (!loaded.success) throw new Error(loaded.error.code);
  const state: State = { provider: undefined, invocations: 0, stopped: false, resources: [] };
  try {
    const activated = await bounded(
      loaded.data.activate({
        generation: {
          scope: plan.inventory.scope,
          definition: config.definition,
          generationId: "g1",
          desiredRevision: plan.inventory.revision,
          appliedRevision: plan.inventory.revision,
        },
        host,
        configuration: config,
        cancellation: {
          get cancelled() {
            return state.stopped;
          },
          onCancel: cancellation.onCancel,
        },
        providers: registrar(state),
        resources: {
          own(resource) {
            if (state.stopped) {
              cleanupResources([resource]).catch(() => diagnostics.write({ level: "error", code: "cleanup-failed" }));
              return;
            }
            state.resources.push(resource);
          },
        },
      }),
    );
    if (!activated.success || !state.provider) throw new Error("activation-failed");
    state.resources.push(activated.data);
    return session(state, plan.inventory.validity);
  } catch {
    state.stopped = true;
    await cleanupResources(state.resources);
    throw new Error("activation-failed");
  }
}

function session(state: State, validity: Validity) {
  return {
    counts: () => ({ activations: 1, invocations: state.invocations, stopped: state.stopped }),
    async invoke(input: JsonValue, context: InvocationContext) {
      if (state.stopped || !state.provider || Date.now() >= Math.min(validity.freshUntil, validity.authorizedUntil)) throw new Error("unavailable");
      state.invocations++;
      return bounded(state.provider.invoke(input, context));
    },
    async stop() {
      if (state.stopped) return;
      state.stopped = true;
      await cleanupResources(state.resources);
    },
  };
}
