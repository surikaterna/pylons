import type {
  ActivationContext,
  ArtifactLoader,
  Cancellation,
  Clock,
  DefinitionCatalog,
  Diagnostic,
  DiagnosticSink,
  Event,
  LifecycleEvent,
  OwnedResource,
  PlanSource,
  PluginFactory,
  Provider,
  ProviderRegistrar,
  ResourceOwnership,
  RuntimeObserver,
} from "../src/index.js";
import { parsePluginDefinition, parseResolvedPlan } from "../src/index.js";
import { definition, plan } from "./fixtures.js";

export function eventFake<T>(): { readonly event: Event<T>; fire(value: T): void; size(): number } {
  const listeners = new Set<(value: T) => void>();
  return {
    event(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire(value) {
      for (const listener of [...listeners]) listener(value);
    },
    size() {
      return listeners.size;
    },
  };
}
export function cancellationFake(): { readonly cancellation: Cancellation; cancel(): void } {
  const event = eventFake<void>();
  let cancelled = false;
  return {
    cancellation: {
      get cancelled() {
        return cancelled;
      },
      onCancel: event.event,
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      event.fire();
    },
  };
}
export const neverCancelled: Cancellation = cancellationFake().cancellation;

export function sourceFake(executable = false): PlanSource {
  return {
    async read(context, cancellation) {
      if (cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
      if (context.scope.tenantId !== "tenant-a") return { success: false, error: { code: "unauthorized" } };
      const parsed = parseResolvedPlan(plan(executable));
      return parsed.success ? parsed : { success: false, error: { code: "invalid-plan" } };
    },
  };
}
export function catalogFake(): DefinitionCatalog {
  return {
    async read(ref, cancellation) {
      if (cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
      if (ref.pluginId !== definition().identity.pluginId) return { success: false, error: { code: "not-found" } };
      const parsed = parsePluginDefinition(definition());
      return parsed.success ? parsed : { success: false, error: { code: "invalid-definition" } };
    },
  };
}
export function registrarFake(): { readonly port: ProviderRegistrar; readonly providers: Map<string, Provider> } {
  const providers = new Map<string, Provider>();
  return {
    providers,
    port: {
      register(capability, provider) {
        if (providers.has(capability.capabilityId)) return { success: false, error: { code: "duplicate-provider" } };
        providers.set(capability.capabilityId, provider);
        return {
          success: true,
          data: {
            dispose() {
              providers.delete(capability.capabilityId);
            },
          },
        };
      },
    },
  };
}
export function ownershipFake(): { readonly port: ResourceOwnership; readonly acquired: OwnedResource[] } {
  const acquired: OwnedResource[] = [];
  return {
    acquired,
    port: {
      own(resource) {
        acquired.push(resource);
      },
    },
  };
}
export function factoryFake(contexts: ActivationContext[]): PluginFactory {
  return {
    async activate(context) {
      contexts.push(context);
      const registration = context.providers.register(
        { capabilityId: "validation", contractVersion: "1" },
        {
          async invoke(input, request) {
            if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
            return {
              success: true,
              data: {
                input,
                config: context.configuration.values,
                tenant: context.generation.scope.tenantId,
                generation: context.generation.generationId,
                subject: request.principal.subjectId,
                credential: request.credential.reference,
                transaction: request.transaction.id,
              },
            };
          },
        },
      );
      if (!registration.success) return { success: false, error: { code: "initialization-failed" } };
      const instance: OwnedResource = {
        async cleanup() {
          registration.data.dispose();
          return { success: true, data: undefined };
        },
      };
      context.resources.own(instance);
      return { success: true, data: instance };
    },
  };
}
export function loaderFake(factory: PluginFactory, loads: string[]): ArtifactLoader {
  return {
    async load(request) {
      loads.push(request.binding.artifactKey);
      if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
      return { success: true, data: factory };
    },
  };
}
export function observationFake(): {
  readonly observer: RuntimeObserver;
  readonly sink: DiagnosticSink;
  readonly events: LifecycleEvent[];
  readonly diagnostics: Diagnostic[];
} {
  const events: LifecycleEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  return {
    events,
    diagnostics,
    observer: {
      observe(event) {
        events.push(event);
      },
    },
    sink: {
      write(diagnostic) {
        if ((diagnostic.correlation?.length ?? 0) > 128) throw new Error("correlation bound");
        diagnostics.push(diagnostic);
      },
    },
  };
}
export function clockFake(): { readonly port: Clock; advance(milliseconds: number): void } {
  let now = 0;
  const scheduled = new Map<() => void, number>();
  return {
    port: {
      now: () => now,
      schedule(delay, callback) {
        scheduled.set(callback, now + delay);
        return {
          dispose() {
            scheduled.delete(callback);
          },
        };
      },
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [callback, deadline] of [...scheduled]) {
        if (deadline > now) continue;
        scheduled.delete(callback);
        callback();
      }
    },
  };
}
