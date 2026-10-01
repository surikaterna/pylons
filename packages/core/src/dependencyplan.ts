export interface PlanNode {
  readonly id: string;
  readonly required: readonly string[];
  readonly missing: boolean;
}

export interface DependencyPlan {
  readonly layers: readonly (readonly string[])[];
  readonly cycles: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
}

function reaches(start: string, target: string, nodes: ReadonlyMap<string, PlanNode>): boolean {
  const pending = [...(nodes.get(start)?.required ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === target) return true;
    if (!id || visited.has(id)) continue;
    visited.add(id);
    pending.push(...(nodes.get(id)?.required ?? []));
  }
  return false;
}

function blockedNodes(nodes: ReadonlyMap<string, PlanNode>, cycles: ReadonlySet<string>): Set<string> {
  const blocked = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes.values()) {
      if (cycles.has(node.id) || blocked.has(node.id)) continue;
      const invalid = node.missing || node.required.some((id) => !nodes.has(id) || cycles.has(id) || blocked.has(id));
      if (!invalid) continue;
      blocked.add(node.id);
      changed = true;
    }
  }
  return blocked;
}

function layersFor(nodes: ReadonlyMap<string, PlanNode>, excluded: ReadonlySet<string>): string[][] {
  const pending = new Map([...nodes].filter(([id]) => !excluded.has(id)));
  const done = new Set<string>();
  const layers: string[][] = [];
  while (pending.size > 0) {
    const layer = [...pending.values()].filter((node) => node.required.every((id) => done.has(id))).map((node) => node.id);
    if (layer.length === 0) break;
    layers.push(layer);
    for (const id of layer) {
      done.add(id);
      pending.delete(id);
    }
  }
  return layers;
}

export function planDependencies(entries: readonly PlanNode[]): DependencyPlan {
  const nodes = new Map(entries.map((node) => [node.id, node]));
  const cycles = new Set(entries.filter((node) => reaches(node.id, node.id, nodes)).map((node) => node.id));
  const blocked = blockedNodes(nodes, cycles);
  return { cycles, blocked, layers: layersFor(nodes, new Set([...cycles, ...blocked])) };
}
