import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FoundationError, rejectRuntimeLinks, validateManifest } from "./policy.js";

const excluded = new Set([".git", ".beads", "node_modules", "worktrees", ".foundation-build"]);

async function manifests(root: string, budget: { remaining: number }, depth = 0): Promise<string[]> {
  if (depth > 8) throw new FoundationError("Inventory depth exceeds foundation bound");
  const entries = await readdir(root, { withFileTypes: true });
  budget.remaining -= entries.length;
  if (budget.remaining < 0) throw new FoundationError("Inventory size exceeds foundation bound");
  const paths: string[] = [];
  for (const entry of entries) {
    if (depth === 0 && excluded.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new FoundationError("Inventory refuses symbolic links");
    if (entry.isDirectory()) paths.push(...(await manifests(path, budget, depth + 1)));
    if (entry.isFile() && entry.name === "package.json") paths.push(path);
  }
  return paths;
}

export async function verifyPackages(root: string): Promise<readonly string[]> {
  const directory = resolve(root);
  if (!(await lstat(directory)).isDirectory()) {
    throw new FoundationError("Inventory root must be a real directory");
  }
  const paths = await manifests(directory, { remaining: 2000 });
  const rootManifest = join(directory, "package.json");
  for (const path of paths) {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    rejectRuntimeLinks(value);
    if (path !== rootManifest) throw new FoundationError("Unexpected package manifest in foundation stage");
    validateManifest(value);
  }
  if (!paths.includes(rootManifest)) throw new FoundationError("Missing private root manifest");
  return paths;
}
