import { createInstance } from "@module-federation/runtime";
import type { ArtifactLoader } from "@pylons/contracts";
import { isObject } from "./artifact-index.js";
import { isFactory } from "./factory-guard.js";
import { eligible } from "./load-admission.js";

function integrity(hex: string): string {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("invalid-integrity");
  const bytes = hex
    .match(/../g)
    ?.map((pair) => String.fromCharCode(Number.parseInt(pair, 16)))
    .join("");
  if (!bytes) throw new Error("invalid-integrity");
  return `sha256-${btoa(bytes)}`;
}

export function browserLoader(origin: string): ArtifactLoader {
  return {
    async load(request) {
      if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
      const entry = new URL("browser/remoteEntry.js", origin).href;
      if (!eligible(request, origin, "browser")) return { success: false, error: { code: "denied" } };
      try {
        const sri = integrity(request.binding.integrity.digest);
        const runtime = createInstance({
          name: "pylons_browser",
          remotes: [{ name: "basic_validation", entry, type: "global", entryGlobalName: "basic_validation" }],
          plugins: [
            {
              name: "private-browser-sri",
              createScript({ url }) {
                if (url !== entry) throw new Error("origin-denied");
                const script = document.createElement("script");
                script.src = url;
                script.integrity = sri;
                script.crossOrigin = "anonymous";
                return script;
              },
            },
          ],
        });
        const module: unknown = await runtime.loadRemote("basic_validation/factory");
        if (!isObject(module) || !isFactory(module.factory)) return { success: false, error: { code: "invalid-factory" } };
        return { success: true, data: module.factory };
      } catch {
        return { success: false, error: { code: "load-failed" } };
      }
    },
  };
}
