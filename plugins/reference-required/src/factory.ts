import type { PluginFactory } from "@pylons/contracts";
import { object, reference } from "../../../apps/shared/domain.js";
import { acquired, remoteEvent } from "../../../apps/shared/trace-contract.js";
import { initialize, resources } from "../../shared/resources.js";

const plugin = "reference-required";
remoteEvent("evaluation", plugin);
export const factory: PluginFactory = {
  async activate(context) {
    remoteEvent("activation", plugin, context.generation);
    resources(context, plugin);
    if (!(await initialize(context, plugin))) return { success: false, error: { code: "initialization-failed" } };
    const registration = context.providers.register(reference, {
      async invoke(input, request) {
        if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
        remoteEvent("invocation", plugin, context.generation, {
          applied: context.configuration.revision,
          subject: request.principal.subjectId,
          transaction: request.transaction.id,
          requestMatches: request.credential.reference === `credential:${request.principal.subjectId}`,
        });
        return { success: true, data: { valid: object(input) && typeof input.reference === "string" && input.reference.trim().length > 0 } };
      },
    });
    if (!registration.success) return { success: false, error: { code: "initialization-failed" } };
    acquired(context, plugin, "registration", () => registration.data.dispose());
    return {
      success: true,
      data: {
        async cleanup() {
          return { success: true, data: undefined };
        },
      },
    };
  },
};
