import type { Host, JsonValue, ResolvedPlan } from "@pylons/contracts";
import { parseResolvedPlan } from "@pylons/contracts";
import { type Artifact, artifactFor, binding, definition } from "../shared/definitions.js";
import { type Plugin, plugins, type Tenant } from "../shared/domain.js";

export interface ScopeState {
  revision: string;
  until: number;
  enabled: boolean;
  authorized: boolean;
  outage: boolean;
  version: string;
  values: Record<Plugin, Record<string, JsonValue>>;
}
export function state(until: number): ScopeState {
  return {
    revision: "r1",
    until,
    enabled: true,
    authorized: true,
    outage: false,
    version: "1",
    values: { "basic-validation": { minLength: 3, secret: "SECRET_CONFIG_SENTINEL" }, "reference-required": { secret: "SECRET_CONFIG_SENTINEL" } },
  };
}
export function resolvedPlan(host: Host, tenant: Tenant, origin: string, artifacts: readonly Artifact[], current: ScopeState): ResolvedPlan {
  const selected = tenant === "a" ? plugins.slice(0, 1) : plugins;
  const scope = { hostId: `${host}-demo`, tenantId: tenant };
  const definitions = selected.map((plugin) => definition(plugin, current.version));
  const installations = selected.map((plugin) => ({
    definition: definition(plugin, current.version).identity,
    enabled: current.enabled,
    selectedExtensions: ["provider"],
    operatorBindings: [binding(artifactFor(artifacts, plugin, host), origin, current.version)],
  }));
  const value = {
    schemaVersion: 1,
    inventory: {
      schemaVersion: 1,
      scope,
      revision: current.revision,
      validity: { freshUntil: current.until, authorizedUntil: current.until },
      installations: installations.map((entry) => ({
        ...entry,
        definition: { pluginId: entry.definition.pluginId, definitionVersion: entry.definition.definitionVersion },
      })),
    },
    definitions,
    configs: selected.map((plugin) => ({
      schemaVersion: 1,
      scope,
      revision: current.revision,
      definition: { pluginId: plugin, definitionVersion: current.version },
      values: { ...current.values[plugin], origin },
    })),
    provenance: { sourceId: "loopback-fixture", authorizationId: `demo-${tenant}`, revision: current.revision },
  };
  const parsed = parseResolvedPlan(value);
  if (!parsed.success) throw new Error("demo-plan-invalid");
  return parsed.data;
}
