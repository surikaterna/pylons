import type {
  ActivatedInstance,
  ActivationContext,
  ActivationFailure,
  AdmissionDecision,
  Capability,
  Clock,
  ConfigReplacement,
  Dependency,
  Diagnostic,
  Extension,
  InvocationContext,
  LifecycleEvent,
  PlanSource,
  PluginFactory,
  ResolvedPlan,
  Result,
} from "@pylons/contracts";
import { parseResolvedPlan } from "@pylons/contracts";
import { CancellationSource } from "../src/cancellation.js";
import { createRuntime } from "../src/runtime.js";
import type { RuntimeOptions } from "../src/types.js";
import { createVersionOwnership } from "../src/versionownership.js";

export function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!complete) throw new Error("uninitialized-deferred");
      complete(value);
    },
  };
}

export class TestClock implements Clock {
  time = 0;
  private readonly timers = new Set<{ readonly due: number; readonly callback: () => void }>();
  now(): number {
    return this.time;
  }
  schedule(delay: number, callback: () => void) {
    const timer = { due: this.time + delay, callback };
    this.timers.add(timer);
    return {
      dispose: () => {
        this.timers.delete(timer);
      },
    };
  }
  advance(amount: number): void {
    this.time += amount;
    for (const timer of [...this.timers]) {
      if (timer.due > this.time) continue;
      this.timers.delete(timer);
      timer.callback();
    }
  }
  get pending(): number {
    return this.timers.size;
  }
}

export const capability: Capability = { capabilityId: "validation", contractVersion: "opaque" };
export const signal = () => new CancellationSource();

export function extension(id = "entry", dependencies: readonly Dependency[] = [], provides: readonly Capability[] = [capability]): Extension {
  return {
    id,
    artifactKey: id,
    hosts: ["server", "browser", "cli"],
    hostContractVersion: "opaque",
    provides,
    activation: { kind: "demand-capability", capability },
    dependencies,
  };
}

export interface PluginFixture {
  readonly id: string;
  readonly entries?: readonly Extension[];
  readonly dependencies?: readonly Dependency[];
  readonly enabled?: boolean;
  readonly value?: number;
  readonly version?: string;
}

export function plan(plugins: readonly PluginFixture[] = [{ id: "base", entries: [extension()] }], revision = "r1", tenant = "a"): ResolvedPlan {
  const scope = { hostId: "host", tenantId: tenant };
  const definitions = plugins.map((plugin) => ({
    schemaVersion: 1,
    identity: { pluginId: plugin.id, name: plugin.id, definitionVersion: plugin.version ?? "v1" },
    contributions: [],
    extensions: plugin.entries ?? [],
    dependencies: plugin.dependencies ?? [],
  }));
  const installations = plugins.map((plugin) => ({
    definition: { pluginId: plugin.id, definitionVersion: plugin.version ?? "v1" },
    enabled: plugin.enabled ?? true,
    selectedExtensions: (plugin.entries ?? []).map((entry) => entry.id),
    operatorBindings: (plugin.entries ?? []).map(binding),
  }));
  const result = parseResolvedPlan({
    schemaVersion: 1,
    inventory: { schemaVersion: 1, scope, revision, validity: { freshUntil: 1000, authorizedUntil: 2000 }, installations },
    definitions,
    configs: installations.map((entry, index) => ({
      schemaVersion: 1,
      scope,
      revision,
      definition: entry.definition,
      values: { minimum: plugins[index]?.value ?? 3 },
    })),
    provenance: { sourceId: "fixture", revision, authorizationId: "verified" },
  });
  if (!result.success) throw new Error("invalid-fixture");
  return result.data;
}

function binding(entry: Extension) {
  return {
    extensionId: entry.id,
    artifactKey: entry.artifactKey,
    artifactVersion: "artifact",
    locator: "https://fixture.invalid/artifact",
    integrity: { algorithm: "sha256", digest: "a".repeat(64) },
    loaderId: "fixture",
  };
}

export function request(subject = "alice", cancellation = signal()): InvocationContext {
  return { principal: { subjectId: subject }, credential: { reference: `${subject}-credential` }, transaction: { id: `${subject}-transaction` }, cancellation };
}

export interface Hooks {
  activate?(context: ActivationContext): Promise<Result<ActivatedInstance, ActivationFailure>>;
  replace?(revision: string): Promise<ConfigReplacement>;
  policy?(): Promise<AdmissionDecision>;
}

export function harness(initial = plan(), hooks: Hooks = {}, overrides: Partial<RuntimeOptions> = {}) {
  const clock = new TestClock();
  const state = { candidate: initial, loads: 0, activations: 0, cleanups: 0, calls: 0, authorizations: 0, authorized: true };
  const events: LifecycleEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const factory = fixtureFactory(initial, hooks, state);
  const source: PlanSource = {
    async read() {
      return { success: true, data: state.candidate };
    },
  };
  const options = fixtureOptions(initial, hooks, state, factory, source, clock, events, diagnostics);
  return {
    runtime: createRuntime({ ...options, ...overrides }),
    clock,
    events,
    diagnostics,
    setPlan: (value: ResolvedPlan) => {
      state.candidate = value;
    },
    deny: () => {
      state.authorized = false;
    },
    counts: () => ({ loads: state.loads, activations: state.activations, cleanups: state.cleanups, calls: state.calls, authorizations: state.authorizations }),
  };
}

interface FixtureState {
  candidate: ResolvedPlan;
  loads: number;
  activations: number;
  cleanups: number;
  calls: number;
  authorizations: number;
  authorized: boolean;
}

function fixtureFactory(initial: ResolvedPlan, hooks: Hooks, state: FixtureState): PluginFactory {
  return {
    async activate(context) {
      state.activations++;
      if (hooks.activate) return hooks.activate(context);
      for (const provided of initial.definitions.flatMap((definition) => definition.extensions.flatMap((entry) => entry.provides))) {
        context.providers.register(provided, {
          async invoke(input, invocation) {
            state.calls++;
            return {
              success: true,
              data: {
                input,
                values: context.configuration.values,
                subject: invocation.principal.subjectId,
                credential: invocation.credential.reference,
                transaction: invocation.transaction.id,
                tenant: context.generation.scope.tenantId,
              },
            };
          },
        });
      }
      return {
        success: true,
        data: {
          async cleanup() {
            state.cleanups++;
            return { success: true, data: undefined };
          },
          ...(hooks.replace ? { replaceConfiguration: async (config) => (hooks.replace ? hooks.replace(config.revision) : { kind: "restart-required" }) } : {}),
        },
      };
    },
  };
}

function fixtureOptions(
  initial: ResolvedPlan,
  hooks: Hooks,
  state: FixtureState,
  factory: PluginFactory,
  source: PlanSource,
  clock: TestClock,
  events: LifecycleEvent[],
  diagnostics: Diagnostic[],
): RuntimeOptions {
  return {
    context: { scope: initial.inventory.scope, authorizationId: "verified" },
    host: "server",
    hostContractVersion: "opaque",
    source,
    loader: {
      async load() {
        state.loads++;
        return { success: true, data: factory };
      },
    },
    policy: { evaluate: () => (hooks.policy ? hooks.policy() : Promise.resolve({ kind: "allow" })) },
    authority: {
      async authorize() {
        state.authorizations++;
        return state.authorized ? { kind: "allow" } : { kind: "deny" };
      },
    },
    clock,
    observer: {
      observe: (event) => {
        events.push(event);
      },
    },
    diagnostics: {
      write: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
    bounds: { source: 100, policy: 100, load: 100, activation: 100, invocation: 100, replacement: 100, cleanup: 100 },
    supportedContributionKinds: [],
    securityStartupCapabilities: [],
    hostCapabilities: [],
    versionOwnership: createVersionOwnership(),
  };
}

export async function flush(): Promise<void> {
  for (let index = 0; index < 40; index++) await Promise.resolve();
}

export const pluginDependency = (id: string, required = true): Dependency => ({
  kind: "plugin",
  definition: { pluginId: id, definitionVersion: "v1" },
  required,
});
export const capabilityDependency = (value = capability, required = true): Dependency => ({ kind: "capability", capability: value, required });
