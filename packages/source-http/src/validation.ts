import { parseResolvedPlan, type ResolvedPlan, type Result } from "@pylons/contracts";
import type { HttpSourceOptions, MetadataGrant, MetadataRequest } from "./types.js";

export type ReadFailure = { readonly code: "cancelled" | "unavailable" | "unauthorized" | "invalid-plan" | "not-found" };
export function failure(code: ReadFailure["code"]): Result<never, ReadFailure> {
  return { success: false, error: { code } };
}
export function validOptions(options: HttpSourceOptions): boolean {
  return (
    Number.isSafeInteger(options.maxResponseBytes) &&
    options.maxResponseBytes > 0 &&
    Number.isFinite(options.timeoutMilliseconds) &&
    options.timeoutMilliseconds > 0
  );
}
export function validGrant(grant: MetadataGrant, now: number): boolean {
  return (
    Number.isFinite(now) &&
    Number.isFinite(grant.authorizedUntil) &&
    grant.authorizedUntil > now &&
    Number.isFinite(grant.maxFreshnessMilliseconds) &&
    grant.maxFreshnessMilliseconds > 0 &&
    Number.isFinite(now + grant.maxFreshnessMilliseconds) &&
    grant.sourceId.length > 0
  );
}
export function withinBytes(body: string, limit: number): boolean {
  let bytes = 0;
  for (const character of body) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) return false;
  }
  return true;
}
export function validatePlan(input: unknown, request: MetadataRequest, grant: MetadataGrant, started: number, now: number): Result<ResolvedPlan, ReadFailure> {
  const parsed = parseResolvedPlan(input);
  if (!parsed.success) return failure("invalid-plan");
  const plan = parsed.data;
  const scope = plan.inventory.scope;
  const validity = plan.inventory.validity;
  if (!Number.isFinite(now) || now < started) return failure("unavailable");
  if (scope.hostId !== request.context.scope.hostId || scope.tenantId !== request.context.scope.tenantId) return failure("invalid-plan");
  if (plan.provenance.sourceId !== grant.sourceId || plan.provenance.authorizationId !== request.context.authorizationId) return failure("unauthorized");
  if (!validGrant(grant, now) || validity.authorizedUntil > grant.authorizedUntil) return failure("unauthorized");
  if (validity.freshUntil <= now || validity.authorizedUntil <= now || validity.freshUntil > started + grant.maxFreshnessMilliseconds)
    return failure("invalid-plan");
  return parsed;
}
