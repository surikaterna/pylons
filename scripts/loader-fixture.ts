import type { Cancellation, Host, LoadRequest, PluginDefinition } from "@pylons/contracts";
import type { ArtifactMapping, LoaderOptions } from "@pylons/loader-mf/server";

export const neverCancelled: Cancellation = { cancelled: false, onCancel: () => ({ dispose() {} }) };

function definitionFor(pluginId: string): PluginDefinition {
  return {
    schemaVersion: 1,
    identity: { pluginId, name: "Loader fixture", definitionVersion: "1" },
    contributions: [],
    dependencies: [],
    extensions: [
      {
        id: "validation",
        artifactKey: "factory",
        hosts: ["browser", "server", "cli"],
        hostContractVersion: "1",
        provides: [],
        activation: { kind: "startup" },
        dependencies: [],
      },
    ],
  };
}

export function fixture(origin: string, host: Host, digest: string, pluginId = "loader-fixture"): { options: LoaderOptions; request: LoadRequest } {
  const definition = definitionFor(pluginId);
  const extension = definition.extensions[0];
  if (!extension) throw new Error("fixture-extension");
  const binding = {
    extensionId: extension.id,
    artifactKey: extension.artifactKey,
    artifactVersion: "1",
    locator: new URL(host === "browser" ? "browser.js" : "server.js", origin).href,
    loaderId: "loader-mf",
    integrity: { algorithm: "sha256", digest },
  } satisfies LoadRequest["binding"];
  const mapping: ArtifactMapping = {
    definition,
    binding,
    host,
    publisherId: "fixture-publisher",
    container: "loader_fixture",
    expose: "./factory",
    exportName: "factory",
    profile: "single-script",
    executableFiles: [binding.locator],
  };
  return {
    request: { definition, extension, binding, host, cancellation: neverCancelled },
    options: {
      operatorId: "fixture-operator",
      trustedOperatorIds: ["fixture-operator"],
      trustedPublisherIds: ["fixture-publisher"],
      trustedOrigins: [new URL(origin).origin],
      mappings: [mapping],
      limits: { timeoutMilliseconds: 500, maximumBytes: 1000000, maximumMappings: 16, maximumMetadataCharacters: 10000, maximumReservations: 1024 },
      diagnostics: { write() {} },
    },
  };
}

export function cancelSource() {
  const callbacks = new Set<() => void>();
  let cancelled = false;
  const cancellation: Cancellation = {
    get cancelled() {
      return cancelled;
    },
    onCancel(callback) {
      callbacks.add(callback);
      return {
        dispose() {
          callbacks.delete(callback);
        },
      };
    },
  };
  return {
    cancellation,
    cancel() {
      cancelled = true;
      for (const callback of [...callbacks]) callback();
    },
    count: () => callbacks.size,
  };
}
