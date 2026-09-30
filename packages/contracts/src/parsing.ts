import type { z } from "zod/v3";
import { type PluginDefinition, pluginDefinitionSchema } from "./definition.js";
import { type ConfigSideband, configSidebandSchema, type InstallationInventory, installationInventorySchema } from "./installation.js";
import { type ResolvedPlan, resolvedPlanSchema } from "./plan.js";
import { snapshotJson } from "./snapshot.js";

export type Result<T, E> = { readonly success: true; readonly data: T } | { readonly success: false; readonly error: E };
export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly category: "syntax" | "coherence";
}
export interface ParseFailure {
  readonly code: "invalid-json" | "invalid-contract";
  readonly issues: readonly ValidationIssue[];
}

const safeFields = new Set([
  "schemaVersion",
  "identity",
  "pluginId",
  "name",
  "definitionVersion",
  "contributions",
  "id",
  "kind",
  "required",
  "metadata",
  "provider",
  "capabilityId",
  "contractVersion",
  "extensions",
  "artifactKey",
  "hosts",
  "hostContractVersion",
  "provides",
  "activation",
  "dependencies",
  "configurationSchema",
  "scope",
  "hostId",
  "tenantId",
  "revision",
  "validity",
  "freshUntil",
  "authorizedUntil",
  "installations",
  "definition",
  "selectedExtensions",
  "enabled",
  "operatorBindings",
  "extensionId",
  "artifactVersion",
  "locator",
  "integrity",
  "algorithm",
  "digest",
  "loaderId",
  "values",
  "inventory",
  "definitions",
  "configs",
  "provenance",
  "sourceId",
  "authorizationId",
]);

function safeIssue(issue: z.ZodIssue): ValidationIssue {
  const path = issue.path.map((part) => (typeof part === "number" || safeFields.has(part) ? part : "*"));
  const category = issue.code === "custom" && (issue.message === "coherence" || issue.message === "duplicate") ? "coherence" : "syntax";
  return Object.freeze({ path: Object.freeze(path), category });
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): Result<T, ParseFailure> {
  try {
    const snapshot = snapshotJson(input);
    const result = schema.safeParse(snapshot);
    if (result.success) return Object.freeze({ success: true, data: result.data });
    return Object.freeze({
      success: false,
      error: Object.freeze({ code: "invalid-contract", issues: Object.freeze(result.error.issues.slice(0, 32).map(safeIssue)) }),
    });
  } catch {
    return Object.freeze({ success: false, error: Object.freeze({ code: "invalid-json", issues: Object.freeze([]) }) });
  }
}

export function parsePluginDefinition(input: unknown): Result<PluginDefinition, ParseFailure> {
  return parse(pluginDefinitionSchema, input);
}
export function parseInstallationInventory(input: unknown): Result<InstallationInventory, ParseFailure> {
  return parse(installationInventorySchema, input);
}
export function parseConfigSideband(input: unknown): Result<ConfigSideband, ParseFailure> {
  return parse(configSidebandSchema, input);
}
export function parseResolvedPlan(input: unknown): Result<ResolvedPlan, ParseFailure> {
  return parse(resolvedPlanSchema, input);
}
