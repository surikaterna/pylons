import type { LoadFailure, PluginFactory, Result } from "@pylons/contracts";
import { realmState } from "./realm-state.js";
import type { ArtifactMapping } from "./types.js";

export type Loaded = Result<PluginFactory, LoadFailure>;
export interface Flight {
  readonly controller: AbortController;
  readonly promise: Promise<Loaded>;
  leases: number;
  settled: boolean;
}

export function identity(mapping: ArtifactMapping): string {
  const binding = mapping.binding;
  return JSON.stringify([
    mapping.definition.identity,
    binding.extensionId,
    binding.artifactKey,
    binding.artifactVersion,
    binding.locator,
    binding.loaderId,
    binding.integrity.algorithm,
    binding.integrity.digest,
    mapping.host === "browser" ? "browser" : "bun",
    mapping.container,
    mapping.expose,
    mapping.exportName,
  ]);
}

// Reservations are terminal, including failures: evaluation cannot be rolled back safely.
export function reserve(mapping: ArtifactMapping, maximum: number): boolean {
  const { plugins, artifacts, containers } = realmState();
  const plugin = mapping.definition.identity.pluginId;
  const version = JSON.stringify([mapping.definition.identity.definitionVersion, mapping.binding.artifactVersion]);
  const artifact = JSON.stringify([plugin, mapping.binding.artifactKey, mapping.host === "browser" ? "browser" : "bun"]);
  const key = identity(mapping);
  if (plugins.has(plugin) && plugins.get(plugin) !== version) return false;
  if (artifacts.has(artifact) && artifacts.get(artifact) !== key) return false;
  if (containers.has(mapping.container) && containers.get(mapping.container) !== key) return false;
  if (!artifacts.has(artifact) && artifacts.size >= maximum) return false;
  plugins.set(plugin, version);
  artifacts.set(artifact, key);
  containers.set(mapping.container, key);
  return true;
}

export function flight(mapping: ArtifactMapping, start: (signal: AbortSignal) => Promise<Loaded>): Flight {
  const { flights } = realmState();
  const key = identity(mapping);
  const existing = flights.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  const created: Flight = {
    controller,
    promise: Promise.resolve()
      .then(() => start(controller.signal))
      .then(
        (result) => settle(created, result),
        () => settle(created, { success: false, error: { code: "load-failed" } }),
      ),
    leases: 0,
    settled: false,
  };
  flights.set(key, created);
  return created;
}

function settle(shared: Flight, result: Loaded): Loaded {
  // Cancellation validation and publication share one synchronous terminal transition.
  const terminal: Loaded = shared.controller.signal.aborted ? { success: false, error: { code: "cancelled" } } : result;
  shared.settled = true;
  return terminal;
}
