import { createInstance, type ModuleFederationRuntimePlugin } from "@module-federation/runtime";
import { loadScriptNode } from "@module-federation/sdk";
import type { ArtifactLoader } from "@pylons/contracts";
import { object } from "./factory-guard.js";
import { loader } from "./loader.js";
import { checkedBytes, LoadError } from "./transport.js";
import type { ArtifactMapping, LoaderOptions } from "./types.js";

export type { ArtifactMapping, LoaderOptions } from "./types.js";

type Container = Exclude<Awaited<ReturnType<NonNullable<ModuleFederationRuntimePlugin["loadEntry"]>>>, void>;
function container(value: unknown): value is Container {
  return object(value) && typeof value.get === "function" && typeof value.init === "function";
}

async function evaluate(mapping: ArtifactMapping, options: LoaderOptions, signal: AbortSignal): Promise<unknown> {
  if (Reflect.has(globalThis, mapping.container)) throw new LoadError("load-failed");
  const entry = mapping.binding.locator;
  const verify = async (url: string) => {
    if (url !== entry || signal.aborted) throw new LoadError("load-failed");
    const bytes = await checkedBytes(entry, mapping.binding.integrity.digest, options.limits.maximumBytes, signal);
    return new Response(bytes);
  };
  const runtime = createInstance({
    name: `pylons_server_${mapping.container}`,
    remotes: [{ name: mapping.container, entry, type: "commonjs-module" }],
    plugins: [
      {
        name: "pylons-checked-sdk",
        async loadEntry() {
          const info = {
            attrs: { name: mapping.container, globalName: mapping.container, type: "commonjs-module" },
            loaderHook: { createScriptHook: (url: string) => ({ url }), fetch: verify, lifecycle: { fetch: { emit: verify } } },
          };
          await loadScriptNode(entry, info);
          const exported: unknown = Reflect.get(globalThis, mapping.container);
          if (!container(exported)) throw new LoadError("load-failed");
          return exported;
        },
      },
    ],
  });
  return runtime.loadRemote(`${mapping.container}/${mapping.expose.slice(2)}`);
}

export function createServerLoader(options: LoaderOptions): ArtifactLoader {
  return loader(options, ["server", "cli"], evaluate);
}
