import type { PlanSource } from "@pylons/contracts";
import { MetadataReader } from "./transport.js";
import type { HttpSourceOptions } from "./types.js";

export function createHttpPlanSource(options: HttpSourceOptions): PlanSource {
  const reader = new MetadataReader(options);
  return {
    async read(context, cancellation) {
      const result = await reader.read({ kind: "plan", context }, cancellation);
      if (result.success) return result;
      return { success: false, error: { code: result.error.code === "not-found" ? "unavailable" : result.error.code } };
    },
  };
}
