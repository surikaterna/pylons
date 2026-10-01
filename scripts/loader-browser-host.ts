import { createBrowserLoader } from "@pylons/loader-mf/browser";
import { competing } from "./loader-competing.js";
import { metrics } from "./loader-exercise.js";
import { settings } from "./loader-host-options.js";

try {
  const data = await settings(new URL("/", location.href).href, "browser");
  const proof = await competing(createBrowserLoader(data.options), data.options, data.request, data.scenario, createBrowserLoader);
  Reflect.set(globalThis, "loaderProof", { proof, metrics: metrics() });
} catch {
  Reflect.set(globalThis, "loaderProof", { proof: { code: "host-failed" }, metrics: metrics() });
}
