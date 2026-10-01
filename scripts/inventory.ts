import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateContractsManifest, validateCoreManifest, validateLoaderManifest, validateSourceManifest } from "./package-policy.js";
import { FoundationError, record, rejectRuntimeLinks, validateManifest } from "./policy.js";

const excluded = new Set([".git", ".beads", "node_modules", "worktrees", ".foundation-build", ".feasibility-build", ".loader-build", ".demo-build"]);
const privateManifests = new Map([
  ["plugins/basic-validation", "pylons-private-basic-validation"],
  ["plugins/reference-required", "pylons-private-reference-required"],
  ["apps/web-server", "pylons-private-web-server"],
  ["apps/browser", "pylons-private-browser"],
  ["apps/cli", "pylons-private-cli"],
  ["apps/fixture-server", "pylons-private-fixture-server"],
]);

function privateManifest(value: unknown, name: string): void {
  const manifest = record(value);
  if (Object.keys(manifest).length !== 3 || manifest.name !== name || manifest.private !== true || manifest.type !== "module")
    throw new FoundationError("Private harness manifest invalid");
}

async function manifests(root: string, budget: { remaining: number }, publicRoots: readonly string[], depth = 0): Promise<string[]> {
  if (depth > 8) throw new FoundationError("Inventory depth exceeds foundation bound");
  const entries = await readdir(root, { withFileTypes: true });
  budget.remaining -= entries.length;
  if (budget.remaining < 0) throw new FoundationError("Inventory size exceeds foundation bound");
  const paths: string[] = [];
  for (const entry of entries) {
    if (depth === 0 && excluded.has(entry.name)) continue;
    if (publicRoots.includes(root) && (entry.name === "dist" || entry.name === "node_modules")) {
      if (entry.isSymbolicLink()) throw new FoundationError("Inventory refuses symbolic links");
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new FoundationError("Inventory refuses symbolic links");
    if (entry.isDirectory()) paths.push(...(await manifests(path, budget, publicRoots, depth + 1)));
    if (entry.isFile() && entry.name === "package.json") paths.push(path);
  }
  return paths;
}

export async function verifyPackages(root: string): Promise<readonly string[]> {
  const directory = resolve(root);
  if (!(await lstat(directory)).isDirectory()) {
    throw new FoundationError("Inventory root must be a real directory");
  }
  const paths = await manifests(directory, { remaining: 2000 }, [
    join(directory, "packages/contracts"),
    join(directory, "packages/core"),
    join(directory, "packages/source-http"),
    join(directory, "packages/loader-mf"),
  ]);
  const rootManifest = join(directory, "package.json");
  for (const path of paths) {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    rejectRuntimeLinks(value);
    if (path === rootManifest) validateManifest(value);
    else if (path === join(directory, "packages/contracts/package.json")) validateContractsManifest(value);
    else if (path === join(directory, "packages/core/package.json")) validateCoreManifest(value);
    else if (path === join(directory, "packages/source-http/package.json")) validateSourceManifest(value);
    else if (path === join(directory, "packages/loader-mf/package.json")) validateLoaderManifest(value);
    else {
      const expected = [...privateManifests].find(([privateDirectory]) => path === join(directory, privateDirectory, "package.json"));
      if (!expected) throw new FoundationError("Unexpected package manifest outside approved contracts workspace");
      privateManifest(value, expected[1]);
    }
  }
  if (!paths.includes(rootManifest)) throw new FoundationError("Missing private root manifest");
  return paths;
}
