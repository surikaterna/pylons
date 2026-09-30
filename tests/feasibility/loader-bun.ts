import { createInstance, type ModuleFederationRuntimePlugin } from "@module-federation/runtime";
import { loadScriptNode } from "@module-federation/sdk";
import type { ArtifactLoader, LoadRequest } from "@pylons/contracts";
import { isObject } from "./artifact-index.js";
import { isFactory } from "./factory-guard.js";
import { eligible } from "./load-admission.js";

type Container = Exclude<Awaited<ReturnType<NonNullable<ModuleFederationRuntimePlugin["loadEntry"]>>>, void>;
function isContainer(value: unknown): value is Container {
  return isObject(value) && typeof value.get === "function" && typeof value.init === "function";
}

export function bunLoader(origin: string): ArtifactLoader {
  return {
    async load(request: LoadRequest) {
      if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
      const entry = new URL("bun/remoteEntry.js", origin).href;
      if (!eligible(request, origin, "bun")) return { success: false, error: { code: "denied" } };
      let integrityFailed = false;
      const verify = async (url: string) => {
        if (url !== entry) throw new Error("origin-denied");
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
        if (response.status !== 200) throw new Error("status-denied");
        const bytes = await response.arrayBuffer();
        if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== request.binding.integrity.digest) {
          integrityFailed = true;
          throw new Error("integrity-denied");
        }
        return new Response(bytes);
      };
      try {
        const runtime = createInstance({
          name: `pylons_${request.host}`,
          remotes: [{ name: "basic_validation", entry, type: "commonjs-module" }],
          plugins: [
            {
              name: "private-checked-sdk-entry",
              async loadEntry() {
                const info = {
                  attrs: { name: "basic_validation", globalName: "basic_validation", type: "commonjs-module" },
                  loaderHook: { createScriptHook: (url: string) => ({ url }), fetch: verify, lifecycle: { fetch: { emit: verify } } },
                };
                await loadScriptNode(entry, info);
                const container: unknown = Reflect.get(globalThis, "basic_validation");
                if (!isContainer(container)) throw new Error("invalid-container");
                return container;
              },
            },
          ],
        });
        const module: unknown = await runtime.loadRemote("basic_validation/factory");
        if (!isObject(module) || !isFactory(module.factory)) return { success: false, error: { code: "invalid-factory" } };
        return { success: true, data: module.factory };
      } catch {
        return { success: false, error: { code: integrityFailed ? "integrity-mismatch" : "load-failed" } };
      }
    },
  };
}
