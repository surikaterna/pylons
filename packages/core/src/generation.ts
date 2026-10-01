import type {
  ActivatedInstance,
  Cancellation,
  Capability,
  PluginFactory,
  Provider,
  Result,
  RuntimeSnapshot,
  RuntimeState,
  ScopedGeneration,
} from "@pylons/contracts";
import { ActivationFlight } from "./activationflight.js";
import { bounded } from "./boundary.js";
import { CancellationSource } from "./cancellation.js";
import type { Observation } from "./observation.js";
import { ProvisionalProviders } from "./providerregistry.js";
import { OwnedResources } from "./resourceownership.js";
import type { Selection } from "./selection.js";
import type { CoreFailure, RuntimeOptions } from "./types.js";

export interface GenerationHooks {
  current(generation: Generation): boolean;
  dependencies(generation: Generation, cancellation: Cancellation): Promise<boolean>;
  requiredReady(generation: Generation): boolean;
  abandoned(generation: Generation): void;
  reserve(generation: Generation): boolean;
}

export class Generation {
  state: RuntimeState;
  failureCode: RuntimeSnapshot["failureCode"];
  readonly providers: ProvisionalProviders;
  readonly resources: OwnedResources;
  readonly descriptor: ScopedGeneration;
  instance: ActivatedInstance | undefined;
  flight: ActivationFlight | undefined;
  closed = false;
  desiredRevision: string;
  appliedRevision: string | undefined;
  replacing = false;
  readonly lifetime = new CancellationSource();

  constructor(
    public selection: Selection,
    generationId: string,
    private readonly options: RuntimeOptions,
    private readonly observation: Observation,
    private readonly hooks: GenerationHooks,
  ) {
    this.state = selection.state;
    this.desiredRevision = selection.configuration.revision;
    this.appliedRevision = selection.extension ? undefined : selection.configuration.revision;
    this.descriptor = Object.freeze({
      scope: options.context.scope,
      definition: selection.installation.definition,
      generationId,
      desiredRevision: this.desiredRevision,
    });
    this.providers = new ProvisionalProviders(selection.extension?.provides ?? [], this.descriptor, observation);
    this.resources = new OwnedResources(options.clock, options.bounds.cleanup, () => {
      observation.diagnose("cleanup-failed");
      this.setState(this.state, "cleanup-failed");
    });
  }

  snapshot(): RuntimeSnapshot {
    return Object.freeze({
      generation: Object.freeze({
        ...this.descriptor,
        desiredRevision: this.desiredRevision,
        ...(this.appliedRevision ? { appliedRevision: this.appliedRevision } : {}),
      }),
      ...(this.selection.extension ? { extensionId: this.selection.extension.id } : {}),
      state: this.state,
      ...(this.failureCode ? { failureCode: this.failureCode } : {}),
    });
  }

  setState(state: RuntimeState, failureCode?: RuntimeSnapshot["failureCode"]): void {
    this.state = state;
    this.failureCode = failureCode;
    this.observation.emit({ kind: "state-changed", snapshot: this.snapshot() });
  }

  ready(): boolean {
    if (!this.hooks.current(this) || this.closed || this.replacing || this.failureCode || !this.selection.eligible) return false;
    if (this.state === "declaration-only") return this.hooks.requiredReady(this);
    return this.state === "ready" && this.providers.complete() && this.hooks.requiredReady(this);
  }

  provider(capability: Capability): Provider | undefined {
    return this.ready() ? this.providers.get(capability) : undefined;
  }

  async allowed(replacement = false): Promise<boolean> {
    if (!this.hooks.current(this) || this.closed || (this.replacing && !replacement)) return false;
    const request = {
      context: this.options.context,
      selection: this.selection.installation,
      definition: this.selection.definition,
      host: this.options.host,
      validity: this.validity,
      ...(this.selection.extension ? { extension: this.selection.extension } : {}),
      ...(this.selection.binding ? { binding: this.selection.binding } : {}),
    };
    const decision = await bounded(() => this.options.policy.evaluate(request), this.options.clock, this.options.bounds.policy, this.lifetime);
    const allowed =
      decision.kind === "value" && decision.value.kind === "allow" && this.hooks.current(this) && !this.closed && (replacement || !this.replacing);
    if (!allowed && !this.closed) {
      this.observation.diagnose("admission-denied");
      void this.close("denied");
    }
    return allowed;
  }

  validity = { freshUntil: 0, authorizedUntil: 0 };

  demand(cancellation: Cancellation, startup = false): Promise<Result<undefined, CoreFailure>> {
    if (this.ready()) return this.demandReady();
    if (this.closed || !this.hooks.current(this) || !this.selection.eligible || this.replacing)
      return Promise.resolve({ success: false, error: { code: "unavailable" } });
    if (this.state === "failed" || this.state === "restart-required" || this.failureCode)
      return Promise.resolve({ success: false, error: { code: "blocked" } });
    this.flight ??= new ActivationFlight(
      (signal) => this.activate(signal),
      () => this.hooks.abandoned(this),
    );
    return this.flight.join(cancellation, startup);
  }

  private async demandReady(): Promise<Result<undefined, CoreFailure>> {
    if ((await this.allowed()) && this.ready()) return { success: true, data: undefined };
    await this.close("denied");
    return { success: false, error: { code: "unavailable" } };
  }

  private async activate(cancellation: Cancellation): Promise<Result<undefined, CoreFailure>> {
    if (!(await this.allowed()) || cancellation.cancelled) return this.fail("activation-failed");
    const dependencies = await this.hooks.dependencies(this, cancellation);
    if (!dependencies || !(await this.allowed()) || cancellation.cancelled) return this.fail("dependency-missing");
    const { extension, binding } = this.selection;
    if (!extension) {
      this.setState("declaration-only");
      return { success: true, data: undefined };
    }
    if (!binding) return this.fail("load-failed");
    if (!this.hooks.reserve(this)) {
      this.setState("restart-required");
      return { success: false, error: { code: "restart-required" } };
    }
    this.setState("loading");
    const load = await bounded(
      () => this.options.loader.load({ definition: this.selection.definition, extension, binding, host: this.options.host, cancellation }),
      this.options.clock,
      this.options.bounds.load,
      cancellation,
    );
    if (load.kind !== "value") return this.fail("load-failed", load.kind === "timeout" ? "timeout" : "unavailable");
    if (!load.value.success) return this.fail("load-failed");
    const factory = load.value.data;
    if (!(await this.allowed()) || cancellation.cancelled) return this.fail("activation-failed");
    return this.initialize(factory, cancellation);
  }

  private async initialize(factory: PluginFactory, cancellation: Cancellation): Promise<Result<undefined, CoreFailure>> {
    this.setState("activating");
    const activated = await bounded(
      async () => {
        const result = await factory.activate({
          generation: this.descriptor,
          host: this.options.host,
          configuration: this.selection.configuration,
          cancellation,
          providers: this.providers,
          resources: this.resources,
        });
        if (result.success) this.resources.own(result.data);
        return result;
      },
      this.options.clock,
      this.options.bounds.activation,
      cancellation,
    );
    if (activated.kind !== "value") return this.fail("activation-failed", activated.kind === "timeout" ? "timeout" : "unavailable");
    if (!activated.value.success) return this.fail("activation-failed");
    if (!this.providers.complete()) return this.fail("activation-failed", "provider-not-ready");
    if (
      !(await this.hooks.dependencies(this, cancellation)) ||
      !(await this.allowed()) ||
      cancellation.cancelled ||
      !this.providers.complete() ||
      !this.hooks.requiredReady(this)
    )
      return this.fail("activation-failed");
    this.instance = activated.value.data;
    this.appliedRevision = this.selection.configuration.revision;
    this.setState("ready");
    this.providers.publish();
    return this.ready() ? { success: true, data: undefined } : { success: false, error: { code: "unavailable" } };
  }

  private async fail(code: NonNullable<RuntimeSnapshot["failureCode"]>, outcome: CoreFailure["code"] = "unavailable"): Promise<Result<undefined, CoreFailure>> {
    this.providers.close();
    if (!this.closed) this.setState(code === "dependency-missing" ? "blocked" : "failed", code);
    this.observation.diagnose(code === "load-failed" ? "load-failed" : "activation-failed");
    await this.resources.close();
    return { success: false, error: { code: outcome } };
  }

  close(state: RuntimeState = "stopped"): Promise<boolean> {
    this.closed = true;
    this.lifetime.cancel();
    this.providers.close();
    this.flight?.close();
    this.setState(state);
    return this.resources.close();
  }
}
