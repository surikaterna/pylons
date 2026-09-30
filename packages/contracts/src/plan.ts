import { z } from "zod/v3";
import { type DefinitionRef, identifierSchema, pluginDefinitionSchema } from "./definition.js";
import { configSidebandSchema, installationInventorySchema, revisionSchema, type Scope } from "./installation.js";

export function sameDefinition(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.pluginId === right.pluginId && left.definitionVersion === right.definitionVersion;
}
export function sameScope(left: Scope, right: Scope): boolean {
  return left.hostId === right.hostId && left.tenantId === right.tenantId;
}

const planEnvelope = z
  .object({
    schemaVersion: z.literal(1),
    inventory: installationInventorySchema,
    definitions: z.array(pluginDefinitionSchema).readonly(),
    configs: z.array(configSidebandSchema).readonly(),
    provenance: z.object({ sourceId: identifierSchema, revision: revisionSchema, authorizationId: identifierSchema }).strict().readonly(),
  })
  .strict()
  .readonly();
type PlanEnvelope = z.infer<typeof planEnvelope>;

function issue(context: z.RefinementCtx, path: (string | number)[]): void {
  context.addIssue({ code: "custom", path, message: "coherence" });
}

function checkSelections(plan: PlanEnvelope, context: z.RefinementCtx): void {
  plan.inventory.installations.forEach((installation, index) => {
    const definition = plan.definitions.find((entry) => sameDefinition(entry.identity, installation.definition));
    const configs = plan.configs.filter((entry) => sameDefinition(entry.definition, installation.definition));
    if (!definition || configs.length !== 1) issue(context, ["inventory", "installations", index]);
    if (!definition) return;
    const selections = installation.selectedExtensions;
    if (installation.operatorBindings.length !== selections.length) issue(context, ["inventory", "installations", index, "operatorBindings"]);
    for (const id of selections) {
      const extension = definition.extensions.find((entry) => entry.id === id);
      const binding = installation.operatorBindings.find((entry) => entry.extensionId === id);
      if (!extension || !binding || binding.artifactKey !== extension.artifactKey) issue(context, ["inventory", "installations", index, "selectedExtensions"]);
    }
  });
}

function checkReferences(plan: PlanEnvelope, context: z.RefinementCtx): void {
  const references = plan.inventory.installations.map((entry) => entry.definition);
  const keys = plan.definitions.map((entry) => JSON.stringify([entry.identity.pluginId, entry.identity.definitionVersion]));
  if (new Set(keys).size !== keys.length) issue(context, ["definitions"]);
  for (const definition of plan.definitions) {
    if (!references.some((ref) => sameDefinition(ref, definition.identity))) issue(context, ["definitions"]);
  }
  plan.configs.forEach((config, index) => {
    if (!sameScope(config.scope, plan.inventory.scope) || config.revision !== plan.inventory.revision) issue(context, ["configs", index]);
    if (!references.some((ref) => sameDefinition(ref, config.definition))) issue(context, ["configs", index, "definition"]);
  });
}

export const resolvedPlanSchema = planEnvelope.superRefine((plan, context) => {
  if (plan.provenance.revision !== plan.inventory.revision) issue(context, ["provenance", "revision"]);
  checkReferences(plan, context);
  checkSelections(plan, context);
});
export type ResolvedPlan = z.infer<typeof resolvedPlanSchema>;
