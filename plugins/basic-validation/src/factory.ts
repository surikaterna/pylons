import type { ConfigSideband, PluginFactory } from "@pylons/contracts";
import { object, validation } from "../../../apps/shared/domain.js";
import { acquired, remoteEvent } from "../../../apps/shared/trace-contract.js";
import { initialize, resources } from "../../shared/resources.js";

const plugin = "basic-validation";
remoteEvent("evaluation", plugin);
function minimum(configuration: ConfigSideband): number | undefined {
  const values = configuration.values;
  return object(values) && typeof values.minLength === "number" && Number.isInteger(values.minLength) && values.minLength > 0 ? values.minLength : undefined;
}

export const factory: PluginFactory = {
  async activate(context) {
    remoteEvent("activation", plugin, context.generation);
    let appliedMinimum = minimum(context.configuration);
    let appliedRevision = context.configuration.revision;
    if (appliedMinimum === undefined) return { success: false, error: { code: "unsupported-contract" } };
    resources(context, plugin);
    if (!(await initialize(context, plugin))) return { success: false, error: { code: "initialization-failed" } };
    const registration = context.providers.register(validation, {
      async invoke(input, request) {
        if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
        remoteEvent("invocation", plugin, context.generation, {
          applied: appliedRevision,
          subject: request.principal.subjectId,
          transaction: request.transaction.id,
          requestMatches: request.credential.reference === `credential:${request.principal.subjectId}`,
        });
        const title = object(input) ? input.title : undefined;
        return { success: true, data: { valid: typeof title === "string" && title.length >= (appliedMinimum ?? 1) } };
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
        async replaceConfiguration(configuration, cancellation) {
          const next = minimum(configuration);
          const values = configuration.values;
          if (cancellation.cancelled) return { kind: "failed", code: "cancelled" };
          if (next === undefined || (object(values) && values.replace === "fail")) return { kind: "failed", code: "replacement-failed" };
          if (object(values) && values.replace === "mismatch") return { kind: "applied", appliedRevision: "mismatched" };
          appliedMinimum = next;
          appliedRevision = configuration.revision;
          remoteEvent("replacement", plugin, context.generation, { applied: appliedRevision, desired: appliedRevision });
          return { kind: "applied", appliedRevision };
        },
      },
    };
  },
};
