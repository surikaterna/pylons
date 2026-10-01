import { createBrowserLoader } from "@pylons/loader-mf/browser";
import { DemoHost } from "../shared/host.js";
import { bindLogging, diagnostics } from "../shared/logging.js";
import { loaderOptions, operatorArtifacts } from "../shared/source.js";
import { attachView } from "./view.js";

async function main(): Promise<void> {
  bindLogging();
  const origin = location.origin;
  const artifacts = await operatorArtifacts(origin);
  const host = new DemoHost("browser", origin, createBrowserLoader(loaderOptions(origin, "browser", artifacts, diagnostics)), artifacts);
  Reflect.set(globalThis, "__demoHost", host);
  attachView(host);
  const discovered = await Promise.all([host.discover("a"), host.discover("b")]);
  if (host.closed) return;
  if (discovered.some((value) => !value.result.success)) throw new Error("metadata-failed");
  host.initializeSecurity(true);
  await Promise.all([host.scoped("a").startup(), host.scoped("b").startup()]);
  document.getElementById("status")?.replaceChildren("Metadata ready; providers remain lazy.");
}
main().catch(() => document.getElementById("status")?.replaceChildren("Infrastructure failed."));
