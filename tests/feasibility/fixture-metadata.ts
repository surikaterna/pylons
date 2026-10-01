import type { Host } from "@pylons/contracts";
import type { Artifact } from "./artifact-index.js";
import { capability } from "./metadata.js";

const identity = { pluginId: "basic-validation", definitionVersion: "1" };
const definition = {
  schemaVersion: 1,
  identity: { ...identity, name: "Basic validation" },
  contributions: [{ id: "title", kind: "document:validation", required: true, metadata: {}, provider: capability }],
  extensions: [
    {
      id: "validation",
      artifactKey: "basic",
      hosts: ["browser", "server", "cli"],
      hostContractVersion: "1",
      provides: [capability],
      activation: { kind: "demand-capability", capability },
      dependencies: [],
    },
  ],
  dependencies: [],
};

function binding(origin: string, artifact: Artifact) {
  return {
    extensionId: "validation",
    artifactKey: "basic",
    artifactVersion: "1",
    locator: new URL(artifact.file, origin).href,
    integrity: { algorithm: "sha256", digest: artifact.sha256 },
    loaderId: artifact.target === "browser" ? "private-browser" : "private-bun",
  };
}

export function fixturePlan(host: Host, origin: string, artifact: Artifact) {
  const scope = { hostId: host, tenantId: "opaque-a" };
  return {
    schemaVersion: 1,
    definitions: [structuredClone(definition)],
    inventory: {
      schemaVersion: 1,
      scope,
      revision: "r1",
      validity: { freshUntil: Date.now() + 60_000, authorizedUntil: Date.now() + 60_000 },
      installations: [{ definition: identity, enabled: true, selectedExtensions: ["validation"], operatorBindings: [binding(origin, artifact)] }],
    },
    configs: [{ schemaVersion: 1, scope, revision: "r1", definition: identity, values: { minLength: 3 } }],
    provenance: { sourceId: "fixture", revision: "r1", authorizationId: "local-authority" },
  };
}
