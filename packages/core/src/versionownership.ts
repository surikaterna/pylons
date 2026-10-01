import type { VersionOwnership } from "./types.js";

// Share one owner for every coordinator using the same process/module cache; no hot-unload release.
export function createVersionOwnership(): VersionOwnership {
  const definitions = new Map<string, string>();
  const artifacts = new Map<string, string>();
  return {
    reserve(request): boolean {
      const plugin = request.definition.pluginId;
      const definition = definitions.get(plugin);
      const key = JSON.stringify([plugin, request.extensionId, request.host]);
      const identity = JSON.stringify(request.binding);
      const artifact = artifacts.get(key);
      if ((definition !== undefined && definition !== request.definition.definitionVersion) || (artifact !== undefined && artifact !== identity)) return false;
      definitions.set(plugin, request.definition.definitionVersion);
      artifacts.set(key, identity);
      return true;
    },
  };
}
