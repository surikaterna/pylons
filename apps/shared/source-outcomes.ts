import type { CatalogFailure, DefinitionCatalog, PlanSource, SourceFailure } from "@pylons/contracts";
import type { Tenant } from "./domain.js";
import type { HostClock } from "./lifetime.js";

export interface SourceOutcome {
  readonly operationId: string;
  readonly scope: Tenant;
  readonly operation: "plan" | "catalog";
  readonly at: number;
  readonly code: "ok" | SourceFailure["code"] | CatalogFailure["code"];
}

let operationSequence = 0;

export function observedPorts(
  ports: { readonly source: PlanSource; readonly catalog: DefinitionCatalog },
  scope: Tenant,
  clock: HostClock,
  capture: (outcome: SourceOutcome) => void,
): { readonly source: PlanSource; readonly catalog: DefinitionCatalog } {
  return {
    source: {
      ...(ports.source.onInvalidation ? { onInvalidation: ports.source.onInvalidation } : {}),
      async read(context, cancellation) {
        const operationId = `source-${++operationSequence}`;
        const result = await ports.source.read(context, cancellation);
        capture({ operationId, scope, operation: "plan", at: clock.now(), code: result.success ? "ok" : result.error.code });
        return result;
      },
    },
    catalog: {
      async read(definition, cancellation) {
        const operationId = `source-${++operationSequence}`;
        const result = await ports.catalog.read(definition, cancellation);
        capture({ operationId, scope, operation: "catalog", at: clock.now(), code: result.success ? "ok" : result.error.code });
        return result;
      },
    },
  };
}

export function sourceGuidance(code: SourceOutcome["code"]): string {
  if (code === "invalid-plan")
    return "Invalid or expired metadata. Restart the demo fixture from this rebuilt worktree and use its printed fixture origin; grants last 60 seconds and are not renewed.";
  if (code === "invalid-definition") return "Invalid catalog metadata; rebuild and restart the demo fixture.";
  if (code === "unauthorized") return "Metadata authorization failed; check the host and tenant credential.";
  if (code === "unavailable") return "Metadata source unavailable; check the printed fixture origin and network availability.";
  if (code === "not-found") return "Definition not found in the authorized catalog.";
  if (code === "cancelled") return "Metadata operation cancelled.";
  return "Metadata read succeeded; this does not imply executable readiness.";
}
