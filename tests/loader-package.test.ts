import { expect, test } from "bun:test";
import { loaderDeclarations, validateLoaderTar } from "../scripts/loader-package-graph.js";
import { loaderManifest, validateLoaderManifest } from "../scripts/package-policy.js";

test("loader package exports only actual chosen targets and exact runtime dependencies", () => {
  expect(() => validateLoaderManifest(loaderManifest)).not.toThrow();
  expect(() => validateLoaderManifest({ ...loaderManifest, dependencies: { ...loaderManifest.dependencies, "@pylons/core": "0.0.0" } })).toThrow();
  expect(() => validateLoaderManifest({ ...loaderManifest, dependencies: { ...loaderManifest.dependencies, "@pylons/contracts": "workspace:*" } })).toThrow();
});
test("loader packed-target declarations reject vendor/ambient/unchosen host backedges", () => {
  const files = ["/consumer/node_modules/@pylons/loader-mf/dist/browser.d.ts"];
  expect(() => loaderDeclarations(files, "browser")).not.toThrow();
  for (const bad of [
    "/consumer/node_modules/@module-federation/sdk/dist/index.d.ts",
    "/lib.dom.d.ts",
    "/consumer/node_modules/@types/bun/index.d.ts",
    "/consumer/node_modules/@pylons/loader-mf/dist/server.d.ts",
  ])
    expect(() => loaderDeclarations([...files, bad], "browser")).toThrow();
  expect(() => validateLoaderTar(["package/src/private.ts"])).toThrow();
});
