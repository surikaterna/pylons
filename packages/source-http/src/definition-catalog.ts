import type { DefinitionCatalog, VerifiedContext } from "@pylons/contracts";
import { MetadataReader } from "./transport.js";
import type { HttpSourceOptions } from "./types.js";

export function createHttpDefinitionCatalog(options: HttpSourceOptions, context: VerifiedContext): DefinitionCatalog {
  const reader = new MetadataReader(options);
  const bound = Object.freeze({ scope: Object.freeze({ ...context.scope }), authorizationId: context.authorizationId });
  return {
    async read(definition, cancellation) {
      try {
        const requested = Object.freeze({ pluginId: definition.pluginId, definitionVersion: definition.definitionVersion });
        const result = await reader.read({ kind: "definition", context: bound, definition: requested }, cancellation);
        if (!result.success) {
          const code = result.error.code;
          return { success: false, error: { code: code === "invalid-plan" ? "invalid-definition" : code === "unauthorized" ? "unavailable" : code } };
        }
        const data = result.data.definitions.find(
          (entry) => entry.identity.pluginId === requested.pluginId && entry.identity.definitionVersion === requested.definitionVersion,
        );
        return data ? { success: true, data } : { success: false, error: { code: "invalid-definition" } };
      } catch {
        return { success: false, error: { code: "invalid-definition" } };
      }
    },
  };
}
