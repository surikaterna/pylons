import type { ArtifactBinding, ConfigSideband, Extension, InstallationInventory, PluginDefinition, ResolvedPlan, Scope } from "../src/index.js";

export const scope: Scope = { hostId: "host", tenantId: "tenant-a" };
export const extension: Extension = {
  id: "validation",
  artifactKey: "validation-code",
  hosts: ["server", "browser", "cli"],
  hostContractVersion: "1",
  provides: [{ capabilityId: "validation", contractVersion: "1" }],
  activation: { kind: "demand-capability", capability: { capabilityId: "validation", contractVersion: "1" } },
  dependencies: [],
};
export const binding: ArtifactBinding = {
  extensionId: "validation",
  artifactKey: "validation-code",
  artifactVersion: "artifact-7",
  locator: "https://fixture.invalid/plugin.js",
  integrity: { algorithm: "sha256", digest: "a".repeat(64) },
  loaderId: "fixture",
};
export function definition(executable = false): PluginDefinition {
  return {
    schemaVersion: 1,
    identity: { pluginId: "example.validation", name: "Validation", definitionVersion: "definition-2" },
    contributions: [
      {
        id: "validation-rule",
        kind: "example:validation",
        required: true,
        metadata: { title: "Validate" },
        provider: { capabilityId: "validation", contractVersion: "1" },
      },
    ],
    extensions: executable ? [extension] : [],
    dependencies: [],
    configurationSchema: { type: "object" },
  };
}
export function inventory(executable = false): InstallationInventory {
  return {
    schemaVersion: 1,
    scope,
    revision: "revision-a",
    validity: { freshUntil: 1000, authorizedUntil: 2000 },
    installations: [
      {
        definition: { pluginId: "example.validation", definitionVersion: "definition-2" },
        enabled: true,
        selectedExtensions: executable ? ["validation"] : [],
        operatorBindings: executable ? [binding] : [],
      },
    ],
  };
}
export function config(tenantId = "tenant-a", revision = "revision-a"): ConfigSideband {
  return {
    schemaVersion: 1,
    scope: { hostId: "host", tenantId },
    revision,
    definition: { pluginId: "example.validation", definitionVersion: "definition-2" },
    values: { minimum: 3 },
  };
}
export function plan(executable = false): ResolvedPlan {
  return {
    schemaVersion: 1,
    inventory: inventory(executable),
    definitions: [definition(executable)],
    configs: [config()],
    provenance: { sourceId: "fixture", revision: "revision-a", authorizationId: "verified" },
  };
}
