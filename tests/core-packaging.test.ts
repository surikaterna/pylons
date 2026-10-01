import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installedGraph, javascriptClosure, validateDeclarationFiles } from "../scripts/closure.js";
import { buildCore } from "../scripts/core-build.js";
import { verifyPackages } from "../scripts/inventory.js";
import { contractsManifest, coreManifest, validateCoreManifest, validateInstalledManifest } from "../scripts/package-policy.js";
import { FoundationError, foundationManifest } from "../scripts/policy.js";

async function fixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp("/tmp/opencode/pylons-core-negative-");
  try {
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("exact core facade permits registry dependency only and preserves contracts profile", () => {
  expect(() => validateCoreManifest(coreManifest)).not.toThrow();
  expect(() => validateInstalledManifest(coreManifest, "core")).not.toThrow();
  expect(() => validateInstalledManifest(coreManifest)).toThrow(FoundationError);
  for (const dependency of ["workspace:*", "file:../contracts", "link:../contracts", "^0.0.0"]) {
    expect(() => validateCoreManifest({ ...coreManifest, dependencies: { "@pylons/contracts": dependency } })).toThrow(FoundationError);
  }
  const declarations = ["/clean/node_modules/zod/v3/index.d.cts", "/clean/node_modules/@pylons/core/dist/index.d.ts"];
  expect(() => validateDeclarationFiles(declarations, "core")).not.toThrow();
  expect(() => validateDeclarationFiles(declarations)).toThrow(FoundationError);
  for (const file of [
    "/lib.dom.d.ts",
    "/node_modules/@types/bun/index.d.ts",
    "/node_modules/@module-federation/runtime/index.d.ts",
    "/node_modules/slf/index.d.ts",
  ]) {
    expect(() => validateDeclarationFiles([...declarations, file], "core")).toThrow(FoundationError);
  }
});

test("core output ownership refuses symlinks and lookalike exclusions", async () => {
  await fixture(async (root) => {
    await mkdir(join(root, "packages/core"), { recursive: true });
    await symlink("/tmp/opencode", join(root, "packages/core/dist"));
    await expect(buildCore(root)).rejects.toThrow("linked core build");
    await writeFile(join(root, "package.json"), JSON.stringify(foundationManifest));
    await expect(verifyPackages(root)).rejects.toThrow("symbolic links");
    await rm(join(root, "packages/core/dist"));
    await mkdir(join(root, "other/packages/core/dist"), { recursive: true });
    await writeFile(join(root, "other/packages/core/dist/package.json"), JSON.stringify(coreManifest));
    await expect(verifyPackages(root)).rejects.toThrow("Unexpected package");
  });
});

test("core selected JS graph rejects linked outputs and unchosen graphs", async () => {
  await fixture(async (root) => {
    const entry = join(root, "node_modules/@pylons/core/index.js");
    await mkdir(join(root, "node_modules/@pylons/core"), { recursive: true });
    await symlink(join(root, "package.json"), entry);
    await writeFile(join(root, "package.json"), "export const linked = true;");
    await expect(javascriptClosure(entry, root, "core")).rejects.toThrow("linked output");
    await rm(entry);
    for (const specifier of ["node:fs", "bun", "react", "@module-federation/runtime", "slf", "weaver"]) {
      await writeFile(entry, `import ${JSON.stringify(specifier)};`);
      await expect(javascriptClosure(entry, root, "core")).rejects.toThrow(FoundationError);
    }
  });
});

test("core installation profile has exactly core contracts zod and rejects a linked sibling", async () => {
  await fixture(async (root) => {
    for (const [directory, manifest] of [
      ["@pylons/core", coreManifest],
      ["@pylons/contracts", contractsManifest],
      ["zod", { name: "zod", version: "3.25.76" }],
    ]) {
      if (typeof directory !== "string") throw new Error("invalid-fixture");
      await mkdir(join(root, "node_modules", directory), { recursive: true });
      await writeFile(join(root, "node_modules", directory, "package.json"), JSON.stringify(manifest));
    }
    expect((await installedGraph(root, "core")).length).toBe(3);
    await rm(join(root, "node_modules/@pylons/contracts"), { recursive: true });
    await symlink("/tmp/opencode", join(root, "node_modules/@pylons/contracts"));
    await expect(installedGraph(root, "core")).rejects.toThrow("symlink");
  });
});
