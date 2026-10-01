import type { ArtifactBinding, Host, PluginDefinition } from "@pylons/contracts";
import { type Plugin, reference, validation } from "./domain.js";

export interface Artifact {
  readonly plugin: Plugin;
  readonly target: "browser" | "server";
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}
export function definition(plugin: Plugin, version = "1"): PluginDefinition {
  const capability = plugin === "basic-validation" ? validation : reference;
  return {
    schemaVersion: 1,
    identity: { pluginId: plugin, definitionVersion: version, name: plugin },
    contributions: [{ id: "validation", kind: "demo:validation", required: true, metadata: { title: plugin }, provider: capability }],
    dependencies: plugin === "basic-validation" ? [] : [{ kind: "capability", capability: validation, required: true }],
    configurationSchema: { type: "object" },
    extensions: [
      {
        id: "provider",
        artifactKey: "factory",
        hosts: ["server", "browser", "cli"],
        hostContractVersion: "1",
        provides: [capability],
        activation: { kind: "demand-capability", capability },
        dependencies: [],
      },
    ],
  };
}
export function binding(artifact: Artifact, origin: string, version = "1"): ArtifactBinding {
  return {
    extensionId: "provider",
    artifactKey: "factory",
    artifactVersion: version,
    loaderId: "loader-mf",
    locator: new URL(artifact.file, origin).href,
    integrity: { algorithm: "sha256", digest: artifact.sha256 },
  };
}
export function artifactFor(artifacts: readonly Artifact[], plugin: Plugin, host: Host): Artifact {
  const artifact = artifacts.find((value) => value.plugin === plugin && value.target === (host === "browser" ? "browser" : "server"));
  if (!artifact) throw new Error("demo-artifact-missing");
  return artifact;
}
