import { expect, test } from "bun:test";
import { validateDeclarationFiles } from "../scripts/closure.js";
import { contractsManifest, coreManifest, sourceManifest, validateInstalledManifest, validateSourceManifest } from "../scripts/package-policy.js";

test("source profile accepts only exact source/contracts/Zod graph without core backedge", () => {
  expect(() => validateInstalledManifest(sourceManifest, "source-http")).not.toThrow();
  expect(() => validateInstalledManifest(contractsManifest, "source-http")).not.toThrow();
  expect(() => validateInstalledManifest(coreManifest, "source-http")).toThrow();
  expect(() => validateInstalledManifest(sourceManifest, "core")).toThrow();
  expect(() => validateInstalledManifest(sourceManifest, "contracts")).toThrow();
});
test("source manifest rejects runtime links and unauthorized public subpaths", () => {
  for (const dependency of ["workspace:*", "file:../contracts", "link:../contracts", "*"]) {
    expect(() => validateSourceManifest({ ...sourceManifest, dependencies: { "@pylons/contracts": dependency } })).toThrow();
  }
  expect(() => validateSourceManifest({ ...sourceManifest, exports: { ...sourceManifest.exports, "./private": "./src/types.ts" } })).toThrow();
});
test("source declaration profile requires source and rejects DOM/core/unchosen type graphs", () => {
  const files = ["/consumer/node_modules/zod/v3/index.d.cts", "/consumer/node_modules/@pylons/source-http/dist/index.d.ts"];
  expect(() => validateDeclarationFiles(files, "source-http")).not.toThrow();
  expect(() => validateDeclarationFiles(files.slice(0, 1), "source-http")).toThrow();
  for (const forbidden of [
    "/typescript/lib/lib.dom.d.ts",
    "/node_modules/@types/node/index.d.ts",
    "/node_modules/@pylons/core/dist/index.d.ts",
    "/node_modules/react/index.d.ts",
    "/node_modules/@module-federation/runtime/index.d.ts",
  ]) {
    expect(() => validateDeclarationFiles([...files, forbidden], "source-http")).toThrow();
  }
});
