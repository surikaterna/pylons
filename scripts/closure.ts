import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { type PackageProfile, validateInstalledManifest } from "./package-policy.js";
import { FoundationError } from "./policy.js";

function importsFrom(source: string): readonly string[] {
  const file = ts.createSourceFile("closure.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const specifiers: string[] = [];
  function add(value: ts.Node | undefined): void {
    if (!value || !ts.isStringLiteral(value)) throw new FoundationError("Computed runtime import is forbidden");
    specifiers.push(value.text);
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return specifiers;
}

export function validateDeclarationFiles(files: readonly string[], profile: PackageProfile = "contracts"): void {
  if (!files.some((file) => /\/zod\/v3\//.test(file))) throw new FoundationError("Missing selected v3 declaration closure");
  const forbidden = files.some((file) => /lib\.dom|\/@types\/|\/zod\/v4|ghost|weaver|react|federation|\/packages\/core\/|\/slf|\/debug\//i.test(file));
  if (forbidden) throw new FoundationError("Forbidden declaration dependency");
  if (profile === "contracts" && files.some((file) => /\/@pylons\/core\//.test(file))) throw new FoundationError("Core cannot enter contracts closure");
  if (profile === "core" && !files.some((file) => /\/@pylons\/core\/dist\/index\.d\.ts$/.test(file)))
    throw new FoundationError("Missing selected core declaration closure");
}

export async function installedGraph(consumer: string, profile: PackageProfile = "contracts"): Promise<readonly string[]> {
  const modules = join(consumer, "node_modules");
  const paths: string[] = [];
  for (const entry of await readdir(modules)) {
    if (entry.startsWith(".")) continue;
    const root = join(modules, entry);
    if ((await lstat(root)).isSymbolicLink()) throw new FoundationError("Installed package symlink is forbidden");
    if (entry.startsWith("@")) {
      for (const name of await readdir(root)) paths.push(join(root, name));
    } else paths.push(root);
  }
  for (const path of paths) {
    if ((await lstat(path)).isSymbolicLink()) throw new FoundationError("Installed package symlink is forbidden");
    validateInstalledManifest(JSON.parse(await readFile(join(path, "package.json"), "utf8")), profile);
  }
  if (paths.length !== (profile === "core" ? 3 : 2)) throw new FoundationError("Installed graph must match exact package profile");
  return paths;
}

function resolveImport(specifier: string, file: string, modules: string, profile: PackageProfile): string {
  if (specifier === "zod/v3") return join(modules, "zod/v3/index.js");
  if (profile === "core" && specifier === "@pylons/contracts") return join(modules, "@pylons/contracts/dist/index.js");
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  throw new FoundationError("Unexpected JavaScript runtime import");
}

export async function javascriptClosure(entry: string, consumer: string, profile: PackageProfile = "contracts"): Promise<readonly string[]> {
  const pending = [entry];
  const visited = new Set<string>();
  const modules = join(consumer, "node_modules");
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    if (visited.size >= 200) throw new FoundationError("JavaScript closure budget exceeded");
    if (!file.startsWith(`${modules}/`)) throw new FoundationError("JavaScript closure escapes installed consumer");
    if ((await lstat(file)).isSymbolicLink() || (await realpath(file)) !== file) throw new FoundationError("JavaScript closure refuses linked output");
    visited.add(file);
    const source = await readFile(file, "utf8");
    for (const specifier of importsFrom(source)) {
      pending.push(resolveImport(specifier, file, modules, profile));
    }
  }
  if ([...visited].some((file) => /\/zod\/(?!v3\/)/.test(file))) throw new FoundationError("Unselected Zod runtime closure");
  return [...visited];
}
