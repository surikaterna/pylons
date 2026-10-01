import type { Cancellation, Capability, ResolvedPlan, RuntimeSnapshot } from "@pylons/contracts";
import { CancellationSource } from "./cancellation.js";
import { capabilityKey } from "./compatibility.js";
import { Generation } from "./generation.js";
import type { Observation } from "./observation.js";
import { replaceConfiguration, sameExecutable, sameValues } from "./reconciliation.js";
import type { Selection } from "./selection.js";
import type { SelectedPlan } from "./selectionplan.js";
import { buildSelectedPlan, capabilitySelections } from "./selectionplan.js";
import type { RuntimeOptions } from "./types.js";
import { validPlan } from "./validity.js";

export class Coordinator {
  readonly lifetime = new CancellationSource();
  readonly generations = new Map<string, Generation>();
  private counter = 0;
  private plan: ResolvedPlan | undefined;
  private graph: SelectedPlan = { dependencies: new Map(), cycles: new Set(), blocked: new Set(), optionalMissing: new Set() };
  private selections: readonly Selection[] = [];
  private revoked = false;
  private admissionCancellation = new CancellationSource();
  closed = false;

  constructor(
    readonly options: RuntimeOptions,
    private readonly observation: Observation,
  ) {}

  get admission(): Cancellation {
    return this.admissionCancellation;
  }

  admissionCurrent(admission: Cancellation): boolean {
    return admission === this.admissionCancellation && this.admitting();
  }

  private admitting(): boolean {
    return !this.closed && !this.revoked && !!this.plan && validPlan(this.plan, this.options.context, this.options.clock.now());
  }

  current(generation: Generation): boolean {
    return this.admitting() && this.generations.get(generation.selection.id) === generation;
  }

  private newGeneration(selection: Selection): Generation {
    const generation = new Generation(selection, String(++this.counter), this.options, this.observation, {
      current: (value) => this.current(value),
      requiredReady: (value) => this.requiredReady(value),
      dependencies: (value, signal) => this.dependencies(value, signal),
      abandoned: (value) => this.abandon(value),
      reserve: (value) => this.reserve(value),
    });
    if (this.plan) generation.validity = this.plan.inventory.validity;
    this.generations.set(selection.id, generation);
    if (this.graph.cycles.has(selection.id)) generation.setState("blocked", "dependency-cycle");
    else if (this.graph.blocked.has(selection.id)) generation.setState("blocked", "dependency-missing");
    else generation.setState(selection.state);
    return generation;
  }

  private reserve(generation: Generation): boolean {
    const { selection } = generation;
    if (!selection.extension || !selection.binding) return false;
    return this.options.versionOwnership.reserve({
      definition: selection.installation.definition,
      extensionId: selection.extension.id,
      host: this.options.host,
      binding: selection.binding,
    });
  }

  private abandon(generation: Generation): void {
    if (generation.closed || !this.current(generation)) return;
    void generation.close();
    this.newGeneration(generation.selection);
  }

  requiredReady(generation: Generation): boolean {
    if (!this.admitting()) return false;
    if (this.graph.blocked.has(generation.selection.id) || this.graph.cycles.has(generation.selection.id)) return false;
    const dependencies = this.graph.dependencies.get(generation.selection.id) ?? [];
    if (!dependencies.every((id) => this.generations.get(id)?.ready())) return false;
    const required = [...generation.selection.definition.dependencies, ...(generation.selection.extension?.dependencies ?? [])].filter(
      (edge) => edge.required && edge.kind === "capability",
    );
    return required.every((edge) => edge.kind === "capability" && this.providerReady(edge.capability));
  }

  private async dependencies(generation: Generation, cancellation: Cancellation): Promise<boolean> {
    for (const id of this.graph.dependencies.get(generation.selection.id) ?? []) {
      const dependency = this.generations.get(id);
      if (!dependency || !(await dependency.demand(cancellation)).success || !(await dependency.allowed()) || !dependency.ready()) return false;
    }
    return this.requiredReady(generation);
  }

  private hostMatches(capability: Capability) {
    return this.options.hostCapabilities.filter((entry) => capabilityKey(entry.capability) === capabilityKey(capability) && entry.isReady());
  }

  resolve(capability: Capability): Generation | undefined {
    if (!this.admitting()) return undefined;
    const matches = capabilitySelections(capability, this.selections);
    if (matches.length !== 1 || this.hostMatches(capability).length !== 0) return undefined;
    const selected = matches[0];
    return selected ? this.generations.get(selected.id) : undefined;
  }

  providerReady(capability: Capability): boolean {
    if (!this.admitting()) return false;
    const hosts = this.hostMatches(capability);
    const selected = capabilitySelections(capability, this.selections);
    if (hosts.length + selected.length !== 1) return false;
    return hosts.length === 1 || !!this.resolve(capability)?.provider(capability);
  }

  provider(capability: Capability) {
    if (!this.providerReady(capability)) return undefined;
    return this.hostMatches(capability)[0]?.provider ?? this.resolve(capability)?.provider(capability);
  }

  securityReady(): boolean {
    return this.admitting() && this.options.securityStartupCapabilities.every((capability) => this.providerReady(capability));
  }

  async admit(capability: Capability): Promise<boolean> {
    if (!this.securityReady() || !this.providerReady(capability)) return false;
    const pending = [this.resolve(capability), ...this.options.securityStartupCapabilities.map((value) => this.resolve(value))];
    const seen = new Set<Generation>();
    while (pending.length > 0) {
      const generation = pending.pop();
      if (!generation || seen.has(generation)) continue;
      seen.add(generation);
      if (!(await generation.allowed()) || !generation.ready()) return false;
      pending.push(...(this.graph.dependencies.get(generation.selection.id) ?? []).map((id) => this.generations.get(id)));
    }
    return this.securityReady() && this.providerReady(capability);
  }

  async apply(plan: ResolvedPlan, selections: readonly Selection[], candidateCurrent: () => boolean): Promise<void> {
    const previous = [...this.generations.values()];
    this.plan = plan;
    this.selections = selections;
    this.graph = buildSelectedPlan(selections, this.options.hostCapabilities);
    if (this.revoked) {
      this.admissionCancellation = new CancellationSource();
      this.revoked = false;
    }
    const cleanup: Promise<boolean>[] = [];
    for (const generation of previous) {
      const candidate = selections.find((selection) => selection.id === generation.selection.id);
      if (!candidate?.eligible || this.graph.blocked.has(candidate.id) || this.graph.cycles.has(candidate.id))
        cleanup.push(generation.close(candidate?.eligible ? "blocked" : (candidate?.state ?? "stopped")));
    }
    await Promise.all(cleanup);
    if (this.closed || !candidateCurrent()) return;
    for (const selection of selections) {
      if (!candidateCurrent()) return;
      await this.applySelection(selection, candidateCurrent);
    }
    for (const id of this.graph.optionalMissing) {
      if (this.generations.has(id)) this.observation.diagnose("unsupported-kind");
    }
  }

  private async applySelection(selection: Selection, candidateCurrent: () => boolean): Promise<void> {
    const existing = this.generations.get(selection.id);
    if (this.closed) return;
    if (existing?.state === "restart-required" && selection.eligible) {
      existing.desiredRevision = selection.configuration.revision;
      return;
    }
    if (!existing || existing.closed) {
      this.newGeneration(selection);
      return;
    }
    if (!this.plan) return;
    existing.desiredRevision = this.plan.inventory.revision;
    existing.validity = this.plan.inventory.validity;
    if (!sameExecutable(existing.selection, selection)) {
      await existing.close("restart-required");
      this.observation.diagnose("restart-required");
      return;
    }
    if (sameValues(existing.selection, selection) && existing.selection.configuration.revision === selection.configuration.revision) {
      existing.selection = selection;
      return;
    }
    if (!existing.instance) {
      await existing.close();
      this.newGeneration(selection);
      return;
    }
    await replaceConfiguration(existing, selection, this.plan, this.options, this.observation, candidateCurrent);
  }

  async startup(): Promise<boolean> {
    if (!this.admitting()) return false;
    const admission = this.admission;
    const signal = new CancellationSource();
    try {
      const selected = [...this.generations.values()].filter(
        (generation) => generation.selection.eligible && generation.selection.extension?.activation.kind === "startup",
      );
      const security = this.options.securityStartupCapabilities.map((capability) => this.resolve(capability)).filter((value) => value !== undefined);
      const startups = [...new Set([...selected, ...security])];
      const results = await Promise.all(startups.map((generation) => generation.demand(signal, true)));
      return results.every((result) => result.success) && this.admissionCurrent(admission) && this.securityReady();
    } finally {
      signal.dispose();
    }
  }

  snapshots(): readonly RuntimeSnapshot[] {
    return Object.freeze(
      [...this.generations.values()].map((generation) => {
        const snapshot = generation.snapshot();
        return snapshot.state === "ready" && !generation.ready()
          ? Object.freeze({ ...snapshot, state: "blocked", failureCode: "dependency-missing" })
          : snapshot;
      }),
    );
  }

  expire(): void {
    if (this.closed) return;
    this.revoke();
    for (const generation of this.generations.values()) {
      generation.setState("denied", "expired");
    }
  }

  revoke(): void {
    this.revoked = true;
    this.admissionCancellation.cancel();
    for (const generation of this.generations.values()) void generation.close("denied");
  }

  shutdown(): Promise<boolean> {
    this.closed = true;
    this.lifetime.cancel();
    this.admissionCancellation.cancel();
    const cleanup = [...this.generations.values()].map((generation) => generation.close());
    return Promise.all(cleanup).then((results) => results.every(Boolean));
  }
}
