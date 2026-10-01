import type { PluginFactory, Provider } from "@pylons/contracts";
import { LoggerFactory } from "slf";

const logger = LoggerFactory.getLogger("pylons:remote");
logger.debug("remote evaluated");

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const factory: PluginFactory = {
  async activate(context) {
    const values = context.configuration.values;
    const minimum = object(values) ? values.minLength : undefined;
    if (typeof minimum !== "number" || !Number.isInteger(minimum) || minimum < 1) {
      return { success: false, error: { code: "unsupported-contract" } };
    }
    logger.info("remote activated");
    const provider: Provider = {
      async invoke(input, request) {
        if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
        if (!request.principal.subjectId || !request.credential.reference || !request.transaction.id) {
          return { success: false, error: { code: "denied" } };
        }
        logger.debug("remote invoked");
        const title = object(input) ? input.title : undefined;
        return { success: true, data: { valid: typeof title === "string" && title.length >= minimum } };
      },
    };
    const registration = context.providers.register({ capabilityId: "validation", contractVersion: "1" }, provider);
    if (!registration.success) return { success: false, error: { code: "initialization-failed" } };
    context.resources.own({
      async cleanup() {
        registration.data.dispose();
        logger.info("remote cleaned");
        return { success: true, data: undefined };
      },
    });
    return { success: true, data: { async cleanup() { return { success: true, data: undefined }; } } };
  },
};
