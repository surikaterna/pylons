import { z } from "zod/v3";
import { definitionRefSchema, identifierSchema, versionSchema } from "./definition.js";
import { jsonValueSchema } from "./json.js";

export const scopeSchema = z.object({ hostId: identifierSchema, tenantId: identifierSchema }).strict().readonly();
export type Scope = z.infer<typeof scopeSchema>;
export const revisionSchema = z.string().min(1).max(256);
export const validitySchema = z.object({ freshUntil: z.number().finite(), authorizedUntil: z.number().finite() }).strict().readonly();
export type Validity = z.infer<typeof validitySchema>;

export const artifactBindingSchema = z
  .object({
    extensionId: identifierSchema,
    artifactKey: identifierSchema,
    artifactVersion: versionSchema,
    locator: z.string().min(1).max(2048),
    integrity: z
      .object({ algorithm: z.literal("sha256"), digest: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .readonly(),
    loaderId: identifierSchema,
  })
  .strict()
  .readonly();
export type ArtifactBinding = z.infer<typeof artifactBindingSchema>;

export const installationSchema = z
  .object({
    definition: definitionRefSchema,
    enabled: z.boolean(),
    selectedExtensions: z.array(identifierSchema).readonly(),
    operatorBindings: z.array(artifactBindingSchema).readonly(),
  })
  .strict()
  .readonly();
export type Installation = z.infer<typeof installationSchema>;

export const installationInventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: scopeSchema,
    revision: revisionSchema,
    validity: validitySchema,
    installations: z.array(installationSchema).readonly(),
  })
  .strict()
  .readonly()
  .superRefine((inventory, context) => {
    const ids = inventory.installations.map((entry) => entry.definition.pluginId);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["installations"], message: "duplicate" });
    inventory.installations.forEach((entry, index) => {
      const selections = entry.selectedExtensions;
      const bindings = entry.operatorBindings.map((binding) => binding.extensionId);
      if (new Set(selections).size !== selections.length || new Set(bindings).size !== bindings.length) {
        context.addIssue({ code: "custom", path: ["installations", index], message: "duplicate" });
      }
    });
  });
export type InstallationInventory = z.infer<typeof installationInventorySchema>;

export const configSidebandSchema = z
  .object({
    schemaVersion: z.literal(1),
    scope: scopeSchema,
    revision: revisionSchema,
    definition: definitionRefSchema,
    values: jsonValueSchema,
  })
  .strict()
  .readonly();
export type ConfigSideband = z.infer<typeof configSidebandSchema>;
