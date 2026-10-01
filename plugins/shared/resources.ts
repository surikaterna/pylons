import type { ActivationContext } from "@pylons/contracts";
import { object } from "../../apps/shared/domain.js";
import { acquired } from "../../apps/shared/trace-contract.js";

export function resources(context: ActivationContext, plugin: string): void {
  const values = context.configuration.values;
  const timer = setInterval(() => {}, 100);
  acquired(context, plugin, "interval", () => clearInterval(timer), object(values) && values.cleanupThrow === true);
  const target = new EventTarget();
  const listener = () => {};
  target.addEventListener("demo", listener);
  acquired(context, plugin, "listener", () => target.removeEventListener("demo", listener));
}
export async function initialize(context: ActivationContext, plugin: string): Promise<boolean> {
  const values = context.configuration.values;
  if (!object(values)) return false;
  if (values.initMode === "hold" && typeof values.origin === "string") {
    const controller = new AbortController();
    const subscription = values.ignoreCancel === true ? undefined : context.cancellation.onCancel(() => controller.abort());
    try {
      await fetch(new URL(`init/${plugin}/${context.generation.scope.tenantId}`, values.origin), { signal: controller.signal });
    } catch {
      return false;
    } finally {
      subscription?.dispose();
    }
    const late = setTimeout(() => {}, 1000);
    acquired(context, plugin, "late", () => clearTimeout(late));
  }
  if (values.initMode === "partial-fail") return false;
  return true;
}
