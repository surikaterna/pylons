import { diagnosticView, eventLine } from "../shared/diagnostic-view.js";
import type { DemoHost } from "../shared/host.js";

export function printDiagnostics(host: DemoHost, detailed: boolean, phase: string): void {
  const view = diagnosticView(host);
  console.error(`Lifecycle (${phase}); host security is host-provided: ${view.security ? "ready" : "not ready"}`);
  for (const { scope, snapshot, capabilities } of view.plugins) {
    const value = snapshot.generation;
    console.error(
      `${scope} ${value.definition.pluginId}@${value.definition.definitionVersion} ${snapshot.state} generation=${value.generationId} desired=${value.desiredRevision} applied=${value.appliedRevision ?? "not-applied"}${snapshot.failureCode ? ` failure=${snapshot.failureCode}` : ""}`,
    );
    if (snapshot.state === "blocked") console.error("  Not ready: demand or dependencies may be outstanding; state alone does not identify the cause.");
    if (detailed)
      console.error(
        `  host=${value.scope.hostId} extension=${snapshot.extensionId ?? "unavailable"} declared=${capabilities?.join(",") ?? "metadata-unavailable"}`,
      );
  }
  if (!view.plugins.length) console.error("No plugin snapshots discovered; no plugin state is inferred.");
  const sources = detailed ? view.sources : view.sources.filter((entry) => entry.code !== "ok").slice(-2);
  for (const entry of sources)
    console.error(
      `Discovery / source: ${entry.scope} ${entry.operation} ${entry.code} ${entry.operationId} ${new Date(entry.at).toISOString()} ${entry.guidance}`,
    );
  if (detailed) for (const entry of view.events) console.error(eventLine(entry));
}
