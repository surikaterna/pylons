import type { PluginFactory } from "@pylons/contracts";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const metrics = { evaluated: 1, activated: 0, invoked: 0, cleaned: 0 };
Reflect.set(globalThis, "loaderMetrics", metrics);
export const factory = Object.freeze<PluginFactory>({
  async activate(context) {
    metrics.activated++;
    const values = context.configuration.values;
    const minimum = object(values) && typeof values.minimum === "number" ? values.minimum : 1;
    let stopped = false;
    const registration = context.providers.register(
      { capabilityId: "validation", contractVersion: "1" },
      {
        async invoke(input, request) {
          if (stopped) return { success: false, error: { code: "unavailable" } };
          metrics.invoked++;
          const title = object(input) && typeof input.title === "string" ? input.title : "";
          return { success: true, data: { valid: title.length >= minimum, tenant: context.generation.scope.tenantId, identity: request.principal.subjectId } };
        },
      },
    );
    if (!registration.success) return { success: false, error: { code: "initialization-failed" } };
    return {
      success: true,
      data: {
        async cleanup() {
          if (!stopped) {
            stopped = true;
            registration.data.dispose();
            metrics.cleaned++;
          }
          return { success: true, data: undefined };
        },
      },
    };
  },
});
