import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installedGraph, javascriptClosure, validateDeclarationFiles } from "../scripts/closure.js";
import { buildContracts } from "../scripts/contracts-build.js";
import { verifyPackages } from "../scripts/inventory.js";
import { capture, validateTarContents } from "../scripts/pack-check.js";
import { contractsManifest, validateContractsManifest, validateInstalledManifest } from "../scripts/package-policy.js";
import { FoundationError, foundationManifest } from "../scripts/policy.js";

async function fixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp("/tmp/opencode/pylons-contracts-negative-");
  try {
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("inventory allows only the actual contracts path and exact manifest", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, "package.json"), JSON.stringify(foundationManifest));
    await mkdir(join(root, "packages/contracts"), { recursive: true });
    await writeFile(join(root, "packages/contracts/package.json"), JSON.stringify(contractsManifest));
    expect((await verifyPackages(root)).length).toBe(2);
    await writeFile(join(root, "packages/contracts/package.json"), JSON.stringify({ ...contractsManifest, dependencies: { zod: "^3.25.76" } }));
    await expect(verifyPackages(root)).rejects.toThrow(FoundationError);
  });
});

test.each([
  { version: "0.1.0" },
  { private: true },
  { exports: { ".": { require: "./dist/index.cjs" } } },
  { dependencies: { ghost: "workspace:*" } },
  { dependencies: { zod: "file:../zod" } },
  { peerDependencies: { react: "1.0.0" } },
])("real verifier rejects package surface variation %p", (variation) => {
  expect(() => validateContractsManifest({ ...contractsManifest, ...variation })).toThrow(FoundationError);
});

test.each([
  { name: "@ghost-shell/contracts", version: "1" },
  { name: "react", version: "1" },
  { name: "@pylons/core", version: "0.0.0" },
  { name: "zod", version: "4.5.4" },
  { name: "zod", version: "3.25.76", dependencies: { leak: "link:../leak" } },
  { name: "zod", version: "3.25.76", optionalDependencies: { leak: "1.0.0" } },
])("installed graph policy rejects unselected/transitive runtime %p", (value) => {
  expect(() => validateInstalledManifest(value)).toThrow(FoundationError);
});

test("installed graph traverses actual manifests and rejects missing, extra and linked packages", async () => {
  await fixture(async (root) => {
    await mkdir(join(root, "node_modules/@pylons/contracts"), { recursive: true });
    await mkdir(join(root, "node_modules/zod"));
    await writeFile(join(root, "node_modules/@pylons/contracts/package.json"), JSON.stringify(contractsManifest));
    await writeFile(join(root, "node_modules/zod/package.json"), JSON.stringify({ name: "zod", version: "3.25.76" }));
    expect((await installedGraph(root)).length).toBe(2);
    await mkdir(join(root, "node_modules/react"));
    await writeFile(join(root, "node_modules/react/package.json"), JSON.stringify({ name: "react", version: "1" }));
    await expect(installedGraph(root)).rejects.toThrow(FoundationError);
    await rm(join(root, "node_modules/react"), { recursive: true });
    await rm(join(root, "node_modules/zod"), { recursive: true });
    await symlink("/tmp/opencode", join(root, "node_modules/zod"));
    await expect(installedGraph(root)).rejects.toThrow("symlink");
  });
});

test("tar verifier rejects missing outputs, source/tests and escapes", () => {
  const good = ["package/package.json", "package/LICENSE", "package/README.md", "package/dist/index.js", "package/dist/index.d.ts"];
  expect(() => validateTarContents(good)).not.toThrow();
  for (const contents of [good.slice(1), [...good, "package/src/index.ts"], [...good, "../escape"], [...good, "package/test/runtime.js"]]) {
    expect(() => validateTarContents(contents)).toThrow(FoundationError);
  }
});

test("declaration verifier rejects missing v3, ambient DOM/vendor and v4 closure", () => {
  const good = ["/clean/node_modules/zod/v3/index.d.cts", "/clean/node_modules/@pylons/contracts/dist/index.d.ts"];
  expect(() => validateDeclarationFiles(good)).not.toThrow();
  expect(() => validateDeclarationFiles([])).toThrow(FoundationError);
  for (const file of ["/lib.dom.d.ts", "/node_modules/@types/bun/index.d.ts", "/node_modules/zod/v4/core.d.ts", "/node_modules/react/index.d.ts"]) {
    expect(() => validateDeclarationFiles([...good, file])).toThrow(FoundationError);
  }
});

test("selected JS closure traverses real relative imports, rejects backedges and escaping paths", async () => {
  await fixture(async (root) => {
    const modules = join(root, "node_modules");
    await mkdir(join(modules, "example"), { recursive: true });
    const entry = join(modules, "example/index.js");
    await writeFile(entry, 'export { value } from "./value.js";');
    await writeFile(join(modules, "example/value.js"), "export const value = 1;");
    expect((await javascriptClosure(entry, root)).length).toBe(2);
    await writeFile(entry, 'export { value } from "react";');
    await expect(javascriptClosure(entry, root)).rejects.toThrow(FoundationError);
    await writeFile(entry, 'const vendor = await import("react");');
    await expect(javascriptClosure(entry, root)).rejects.toThrow(FoundationError);
    await writeFile(entry, "const vendor = await import(process.env.VENDOR);");
    await expect(javascriptClosure(entry, root)).rejects.toThrow(FoundationError);
    await writeFile(entry, 'const vendor = require("weaver");');
    await expect(javascriptClosure(entry, root)).rejects.toThrow(FoundationError);
    await writeFile(entry, 'export { value } from "../../escape.js";');
    await expect(javascriptClosure(entry, root)).rejects.toThrow(FoundationError);
  });
});

test("package verifier subprocess failure is never skipped", () => {
  expect(() => capture([process.execPath, "-e", "process.exit(7)"], process.cwd())).toThrow(FoundationError);
});

test("contracts build refuses symlinked output without touching target", async () => {
  await fixture(async (root) => {
    await mkdir(join(root, "packages/contracts"), { recursive: true });
    await symlink("/tmp/opencode", join(root, "packages/contracts/dist"));
    await expect(buildContracts(root)).rejects.toThrow("linked contracts build");
  });
});

test("inventory maintains traversal budget and cannot hide nested manifests at lookalike output paths", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, "package.json"), JSON.stringify(foundationManifest));
    await mkdir(join(root, "other/packages/contracts/dist"), { recursive: true });
    await writeFile(join(root, "other/packages/contracts/dist/package.json"), "{}");
    await expect(verifyPackages(root)).rejects.toThrow("Unexpected package");
    await rm(join(root, "other"), { recursive: true });
    for (let index = 0; index < 2001; index++) await writeFile(join(root, `entry-${index}`), "");
    await expect(verifyPackages(root)).rejects.toThrow("size");
  });
});
