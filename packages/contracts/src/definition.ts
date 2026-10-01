import { z } from "zod/v3";
import { jsonValueSchema } from "./json.js";

export const identifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const versionSchema = z.string().min(1).max(128);
export const definitionRefSchema = z.object({ pluginId: identifierSchema, definitionVersion: versionSchema }).strict().readonly();
export type DefinitionRef = z.infer<typeof definitionRefSchema>;

export const capabilitySchema = z.object({ capabilityId: identifierSchema, contractVersion: versionSchema }).strict().readonly();
export type Capability = z.infer<typeof capabilitySchema>;
export const hostSchema = z.enum(["server", "browser", "cli"]);
export type Host = z.infer<typeof hostSchema>;

export const dependencySchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("plugin"), definition: definitionRefSchema, required: z.boolean() }).strict(),
    z.object({ kind: z.literal("capability"), capability: capabilitySchema, required: z.boolean() }).strict(),
  ])
  .readonly();
export type Dependency = z.infer<typeof dependencySchema>;

export const contributionSchema = z
  .object({
    id: identifierSchema,
    kind: z
      .string()
      .max(256)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*:[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    required: z.boolean(),
    metadata: jsonValueSchema,
    provider: capabilitySchema.optional(),
  })
  .strict()
  .readonly();
export type Contribution = z.infer<typeof contributionSchema>;

export const activationSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("startup") }).strict(),
    z.object({ kind: z.literal("demand-capability"), capability: capabilitySchema }).strict(),
  ])
  .readonly();

export const extensionSchema = z
  .object({
    id: identifierSchema,
    artifactKey: identifierSchema,
    hosts: z
      .array(hostSchema)
      .min(1)
      .refine((hosts) => new Set(hosts).size === hosts.length)
      .readonly(),
    hostContractVersion: versionSchema,
    provides: z.array(capabilitySchema).readonly(),
    activation: activationSchema,
    dependencies: z.array(dependencySchema).readonly(),
  })
  .strict()
  .readonly();
export type Extension = z.infer<typeof extensionSchema>;

export const pluginDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z
      .object({ pluginId: identifierSchema, name: z.string().min(1).max(256), definitionVersion: versionSchema })
      .strict()
      .readonly(),
    contributions: z.array(contributionSchema).readonly(),
    extensions: z.array(extensionSchema).readonly(),
    dependencies: z.array(dependencySchema).readonly(),
    configurationSchema: jsonValueSchema.optional(),
  })
  .strict()
  .readonly()
  .superRefine((definition, context) => {
    const collections: readonly ("contributions" | "extensions")[] = ["contributions", "extensions"];
    for (const key of collections) {
      const ids = definition[key].map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: [key], message: "duplicate" });
    }
  });
export type PluginDefinition = z.infer<typeof pluginDefinitionSchema>;
