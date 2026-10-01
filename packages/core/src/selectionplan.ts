import type { Capability, Dependency } from "@pylons/contracts";
import { capabilityKey, definitionKey } from "./compatibility.js";
import { planDependencies } from "./dependencyplan.js";
import type { Selection } from "./selection.js";
import type { HostCapability } from "./types.js";

export interface SelectedPlan {
  readonly dependencies: ReadonlyMap<string, readonly string[]>;
  readonly cycles: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
  readonly optionalMissing: ReadonlySet<string>;
}

export function capabilitySelections(capability: Capability, selections: readonly Selection[]): readonly Selection[] {
  return selections.filter(
    (selection) => selection.eligible && selection.extension?.provides.some((value) => capabilityKey(value) === capabilityKey(capability)),
  );
}

function targets(dependency: Dependency, selections: readonly Selection[], hosts: readonly HostCapability[]): readonly string[] | undefined {
  if (dependency.kind === "plugin") {
    const matches = selections.filter((selection) => definitionKey(selection.definition.identity) === definitionKey(dependency.definition));
    return matches.length > 0 && matches.every((selection) => selection.eligible) ? matches.map((selection) => selection.id) : undefined;
  }
  const external = hosts.filter((entry) => capabilityKey(entry.capability) === capabilityKey(dependency.capability) && entry.isReady());
  const matches = capabilitySelections(dependency.capability, selections);
  if (external.length + matches.length !== 1) return undefined;
  return external.length === 1 ? [] : matches.map((selection) => selection.id);
}

function edges(selection: Selection, selections: readonly Selection[], hosts: readonly HostCapability[]) {
  const required = new Set<string>();
  let missing = false;
  let optionalMissing = false;
  for (const dependency of [...selection.definition.dependencies, ...(selection.extension?.dependencies ?? [])]) {
    const resolved = targets(dependency, selections, hosts);
    if (!dependency.required) {
      optionalMissing ||= resolved === undefined;
      continue;
    }
    if (!resolved) missing = true;
    else for (const id of resolved) required.add(id);
  }
  return { id: selection.id, required: [...required], missing, optionalMissing };
}

export function buildSelectedPlan(selections: readonly Selection[], hosts: readonly HostCapability[]): SelectedPlan {
  const nodes = selections.filter((selection) => selection.eligible).map((selection) => edges(selection, selections, hosts));
  const plan = planDependencies(nodes);
  return {
    dependencies: new Map(nodes.map((node) => [node.id, node.required])),
    cycles: plan.cycles,
    blocked: plan.blocked,
    optionalMissing: new Set(nodes.filter((node) => node.optionalMissing).map((node) => node.id)),
  };
}
