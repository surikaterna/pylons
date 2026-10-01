import type { Capability, JsonValue } from "@pylons/contracts";

export type Tenant = "a" | "b";
export type Plugin = "basic-validation" | "reference-required";
export const validation: Capability = { capabilityId: "validation", contractVersion: "1" };
export const reference: Capability = { capabilityId: "reference-validation", contractVersion: "1" };
export const security: Capability = { capabilityId: "credential-policy", contractVersion: "1" };
export const plugins: readonly Plugin[] = ["basic-validation", "reference-required"];
export const tenants: readonly Tenant[] = ["a", "b"];
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function tenant(value: unknown): value is Tenant {
  return value === "a" || value === "b";
}
export function document(value: unknown): value is { readonly title: string; readonly reference?: string } {
  return (
    object(value) &&
    typeof value.title === "string" &&
    value.title.length <= 10000 &&
    (value.reference === undefined || typeof value.reference === "string") &&
    Object.keys(value).every((key) => key === "title" || key === "reference")
  );
}
export function validResult(value: JsonValue): boolean {
  return object(value) && value.valid === true;
}
export class DemoError extends Error {
  override readonly name = "DemoError";
  constructor() {
    super("demo-infrastructure-failed");
  }
}
