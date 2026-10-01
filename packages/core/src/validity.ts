import type { ResolvedPlan, VerifiedContext } from "@pylons/contracts";

export function validPlan(plan: ResolvedPlan, context: VerifiedContext, now: number): boolean {
  return (
    Number.isFinite(now) &&
    plan.inventory.scope.hostId === context.scope.hostId &&
    plan.inventory.scope.tenantId === context.scope.tenantId &&
    plan.provenance.authorizationId === context.authorizationId &&
    now < Math.min(plan.inventory.validity.freshUntil, plan.inventory.validity.authorizedUntil)
  );
}

export function expiry(plan: ResolvedPlan): number {
  return Math.min(plan.inventory.validity.freshUntil, plan.inventory.validity.authorizedUntil);
}
