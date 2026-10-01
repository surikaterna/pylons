import { lstat, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { FoundationError } from "./policy.js";

export async function cleanDemo(root: string): Promise<void> {
  const output = join(root, ".demo-build");
  if (!(await lstat(root)).isDirectory()) throw new FoundationError("demo-root-invalid");
  try {
    const entry = await lstat(output);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new FoundationError("demo-output-invalid");
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  await rm(output, { recursive: true, force: true });
}
export async function demoGraph(root: string, entry: string) {
  const pending = [resolve(root, entry)];
  const visited = new Set<string>();
  while (pending.length) {
    const path = pending.pop();
    if (!path || visited.has(path)) continue;
    const name = relative(root, path);
    if (name.startsWith("..") || name.startsWith("plugins/") || name.startsWith("tests/")) throw new FoundationError("demo-host-author-edge");
    visited.add(path);
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith("."))
        pending.push(resolve(dirname(path), specifier.text.replace(/\.js$/, ".ts")));
    }
    if (visited.size > 60) throw new FoundationError("demo-graph-bound");
  }
  return [...visited].map((path) => relative(root, path)).sort();
}
