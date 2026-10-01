import type { LifecycleEvent, RuntimeSnapshot, ScopedGeneration } from "@pylons/contracts";
import { tenants } from "./domain.js";
import type { DemoHost } from "./host.js";
import { sourceGuidance } from "./source-outcomes.js";

// Identifiers are opaque display labels, never terminal control sequences or payloads.
export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:@/-]/g, "_").slice(0, 96) || "unavailable";
}

function generation(value: ScopedGeneration): ScopedGeneration {
  return {
    scope: { hostId: safeId(value.scope.hostId), tenantId: safeId(value.scope.tenantId) },
    definition: { pluginId: safeId(value.definition.pluginId), definitionVersion: safeId(value.definition.definitionVersion) },
    generationId: safeId(value.generationId),
    desiredRevision: safeId(value.desiredRevision),
    ...(value.appliedRevision === undefined ? {} : { appliedRevision: safeId(value.appliedRevision) }),
  };
}

export function safeSnapshot(value: RuntimeSnapshot): RuntimeSnapshot {
  return {
    generation: generation(value.generation),
    state: value.state,
    ...(value.extensionId === undefined ? {} : { extensionId: safeId(value.extensionId) }),
    ...(value.failureCode === undefined ? {} : { failureCode: value.failureCode }),
  };
}

export function safeEvent(event: LifecycleEvent): LifecycleEvent {
  if (event.kind === "state-changed") return { kind: event.kind, snapshot: safeSnapshot(event.snapshot) };
  return {
    kind: event.kind,
    generation: generation(event.generation),
    capability: { capabilityId: safeId(event.capability.capabilityId), contractVersion: safeId(event.capability.contractVersion) },
    ready: event.ready,
  };
}

export function diagnosticView(host: DemoHost) {
  const report = host.report();
  return {
    host: report.host,
    closing: report.closing,
    security: report.security,
    plugins: tenants.flatMap((scope) =>
      host
        .scoped(scope)
        .snapshots()
        .map((snapshot) => ({
          scope,
          snapshot: safeSnapshot(snapshot),
          capabilities: host
            .scoped(scope)
            .metadata()
            .find(
              (entry) =>
                entry.pluginId === snapshot.generation.definition.pluginId && entry.definitionVersion === snapshot.generation.definition.definitionVersion,
            )
            ?.contributions.flatMap((entry) => (entry.provider ? [`${safeId(entry.provider.capabilityId)}@${safeId(entry.provider.contractVersion)}`] : [])),
        })),
    ),
    events: report.events.map((entry) => ({ at: entry.at, event: safeEvent(entry.event) })),
    sources: report.sourceOutcomes.map((entry) => ({ ...entry, guidance: sourceGuidance(entry.code) })),
  };
}

export function eventLine(entry: ReturnType<typeof diagnosticView>["events"][number]): string {
  const event = entry.event;
  const value = event.kind === "state-changed" ? event.snapshot.generation : event.generation;
  const detail =
    event.kind === "state-changed"
      ? `${event.snapshot.state}${event.snapshot.failureCode ? ` / ${event.snapshot.failureCode}` : ""}`
      : `${event.capability.capabilityId}@${event.capability.contractVersion} ready=${event.ready}`;
  return `${new Date(entry.at).toISOString()} ${value.scope.tenantId} ${value.definition.pluginId} ${value.generationId} ${event.kind} ${detail}`;
}
