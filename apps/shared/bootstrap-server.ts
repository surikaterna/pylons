import type { Host } from "@pylons/contracts";
import { createServerLoader } from "@pylons/loader-mf/server";
import { DemoHost } from "./host.js";
import { diagnostics } from "./logging.js";
import { loaderOptions, operatorArtifacts } from "./source.js";

export async function serverHost(origin: string, host: Host): Promise<DemoHost> {
  const artifacts = await operatorArtifacts(origin);
  return new DemoHost(host, origin, createServerLoader(loaderOptions(origin, host, artifacts, diagnostics)), artifacts);
}
