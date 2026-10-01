import type { RuntimeSnapshot, RuntimeState } from "@pylons/contracts";
import type { MetadataEntry } from "@pylons/core";

export const stateExplanation: Readonly<Record<RuntimeState, string>> = {
  absent: "No applicable installation is present.",
  disabled: "This installation is disabled.",
  denied: "Admission was denied; this provider cannot run.",
  unsupported: "The selected extension is not supported by this host.",
  blocked: "Not ready to run: demand or required dependencies may be outstanding. This state alone does not identify the cause.",
  loading: "Executable code is being loaded; it is not ready yet.",
  activating: "The scoped instance is initializing; it is not ready yet.",
  ready: "The scoped instance is ready. Each invocation still requires authorization.",
  failed: "This generation failed. Only the public failure code is shown, when available.",
  stopped: "This generation has stopped; it may be retained in snapshot history.",
  "declaration-only": "Metadata declarations are available without an executable extension.",
  "restart-required": "Configuration changed but this instance needs a restart to apply it.",
};

export interface LifecycleRow {
  readonly snapshot: RuntimeSnapshot;
  readonly capabilities: readonly string[] | undefined;
  readonly appliedRevision: string;
  readonly explanation: string;
}

// Metadata is definition-scoped, not proof of a generation's readiness or currency.
export class LifecycleLabels {
  private readonly labels = new Map<string, readonly string[]>();

  project(snapshots: readonly RuntimeSnapshot[], metadata: readonly MetadataEntry[]): readonly LifecycleRow[] {
    for (const entry of metadata) {
      this.labels.set(
        this.key(entry.pluginId, entry.definitionVersion),
        entry.contributions.flatMap((item) => (item.provider ? [`${item.provider.capabilityId}@${item.provider.contractVersion}`] : [])),
      );
    }
    return snapshots.map((snapshot) => ({
      snapshot,
      capabilities: this.labels.get(this.key(snapshot.generation.definition.pluginId, snapshot.generation.definition.definitionVersion)),
      appliedRevision: snapshot.generation.appliedRevision ?? "not applied",
      explanation: stateExplanation[snapshot.state],
    }));
  }

  private key(pluginId: string, version: string): string {
    return JSON.stringify([pluginId, version]);
  }
}
