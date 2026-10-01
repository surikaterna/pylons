import { type Host, type LoadRequest, parseResolvedPlan, type ResolvedPlan } from "@pylons/contracts";
import { isObject } from "./artifact-index.js";

export const cancellation = Object.freeze({ cancelled: false, onCancel: () => ({ dispose() {} }) });
export const capability = Object.freeze({ capabilityId: "validation", contractVersion: "1" });

export function admit(text: string, host: Host, origin: string, now = Date.now()): { plan: ResolvedPlan; request: LoadRequest } {
  const input: unknown = JSON.parse(text);
  const parsed = parseResolvedPlan(input);
  if (!parsed.success) throw new Error("metadata-invalid");
  const plan = parsed.data;
  const selected = plan.inventory.installations[0];
  const definition = plan.definitions[0];
  const extension = definition?.extensions[0];
  const binding = selected?.operatorBindings[0];
  const valid = plan.inventory.validity;
  if (plan.inventory.scope.hostId !== host || plan.inventory.scope.tenantId !== "opaque-a" || plan.provenance.authorizationId !== "local-authority")
    throw new Error("scope-denied");
  if (now >= valid.freshUntil || now >= valid.authorizedUntil || valid.freshUntil > now + 60_000 || valid.authorizedUntil > now + 60_000)
    throw new Error("validity-denied");
  if (!selected?.enabled || !definition || !extension || !binding || selected.selectedExtensions[0] !== extension.id || !extension.hosts.includes(host))
    throw new Error("selection-denied");
  if (definition.identity.pluginId !== "basic-validation" || definition.identity.definitionVersion !== "1" || binding.artifactVersion !== "1")
    throw new Error("identity-denied");
  const target = host === "browser" ? "browser" : "bun";
  if (binding.locator !== new URL(`${target}/remoteEntry.js`, origin).href || binding.loaderId !== `private-${target}`) throw new Error("target-denied");
  const config = plan.configs[0];
  if (
    !config ||
    !isObject(config.values) ||
    typeof config.values.minLength !== "number" ||
    !Number.isInteger(config.values.minLength) ||
    config.values.minLength < 1 ||
    config.values.minLength > 100
  )
    throw new Error("config-invalid");
  return { plan, request: { definition, extension, host, binding, cancellation } };
}

export async function readMetadata(origin: string, host: Host) {
  const response = await fetch(new URL(`metadata/${host}`, origin), { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (response.status !== 200) throw new Error("metadata-unavailable");
  return admit(await response.text(), host, origin);
}
