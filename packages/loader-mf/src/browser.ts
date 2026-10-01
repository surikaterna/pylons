import { createInstance } from "@module-federation/runtime";
import type { ArtifactLoader } from "@pylons/contracts";
import { loader } from "./loader.js";
import { checkedBytes, LoadError } from "./transport.js";
import type { ArtifactMapping, LoaderOptions } from "./types.js";

export type { ArtifactMapping, LoaderOptions } from "./types.js";

function sri(digest: string): string {
  return `sha256-${btoa(
    digest
      .match(/../g)
      ?.map((pair) => String.fromCharCode(Number.parseInt(pair, 16)))
      .join("") ?? "",
  )}`;
}

async function evaluate(mapping: ArtifactMapping, options: LoaderOptions, signal: AbortSignal): Promise<unknown> {
  if (Reflect.has(globalThis, mapping.container)) throw new LoadError("load-failed");
  const bytes = await checkedBytes(mapping.binding.locator, mapping.binding.integrity.digest, options.limits.maximumBytes, signal);
  if (signal.aborted) throw new LoadError("cancelled");
  const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
  let owned: HTMLScriptElement | undefined;
  const cleanup = () => {
    owned?.remove();
    URL.revokeObjectURL(url);
  };
  const abort = () => {
    owned?.dispatchEvent(new Event("error"));
    cleanup();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const runtime = createInstance({
      name: `pylons_browser_${mapping.container}`,
      remotes: [{ name: mapping.container, entry: url, type: "global", entryGlobalName: mapping.container }],
      plugins: [
        {
          name: "pylons-checked-native-sri",
          createScript({ url: requested }) {
            if (requested !== url || signal.aborted) throw new LoadError("cancelled");
            owned = document.createElement("script");
            owned.src = url;
            owned.integrity = sri(mapping.binding.integrity.digest);
            owned.crossOrigin = "anonymous";
            return { script: owned, timeout: options.limits.timeoutMilliseconds };
          },
        },
      ],
    });
    return await runtime.loadRemote(`${mapping.container}/${mapping.expose.slice(2)}`);
  } finally {
    signal.removeEventListener("abort", abort);
    cleanup();
  }
}

export function createBrowserLoader(options: LoaderOptions): ArtifactLoader {
  return loader(options, ["browser"], evaluate);
}
