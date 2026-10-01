import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import ts from "typescript";
import { validateContractsManifest, validateLoaderManifest } from "./package-policy.js";
import { FoundationError, record, rejectRuntimeLinks } from "./policy.js";

const vendors = new Set(["@module-federation/runtime", "@module-federation/runtime-core", "@module-federation/sdk", "@module-federation/error-codes"]);
export function validateLoaderTar(files: readonly string[]) {
  const required = [
    "package/package.json",
    "package/LICENSE",
    "package/README.md",
    "package/dist/browser.js",
    "package/dist/browser.d.ts",
    "package/dist/server.js",
    "package/dist/server.d.ts",
  ];
  if (required.some((file) => !files.includes(file))) throw new FoundationError("loader-tar-required");
  if (files.some((file) => file.includes("..") || (!/^package\/dist\/[a-z-]+\.(js|d\.ts)$/.test(file) && !required.includes(file))))
    throw new FoundationError("loader-tar-private-file");
}
export async function loaderInstalledGraph(cwd: string) {
  const paths: string[] = [];
  const modules = join(cwd, "node_modules");
  for (const entry of await readdir(modules)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) for (const name of await readdir(join(modules, entry))) paths.push(join(modules, entry, name));
    else paths.push(join(modules, entry));
  }
  if (paths.length !== 7) throw new FoundationError("loader-installed-count");
  for (const path of paths) {
    if ((await lstat(path)).isSymbolicLink()) throw new FoundationError("loader-installed-link");
    const manifest = record(JSON.parse(await readFile(join(path, "package.json"), "utf8")));
    rejectRuntimeLinks(manifest);
    if (manifest.name === "@pylons/loader-mf") validateLoaderManifest(manifest);
    else if (manifest.name === "@pylons/contracts") validateContractsManifest(manifest);
    else if (manifest.name === "zod" && manifest.version === "3.25.76") continue;
    else if (typeof manifest.name !== "string" || !vendors.has(manifest.name) || manifest.version !== "2.9.0")
      throw new FoundationError("loader-installed-vendor");
  }
  return paths;
}

export function loaderDeclarations(files: readonly string[], target: "browser" | "server") {
  if (!files.some((file) => file.endsWith(`/@pylons/loader-mf/dist/${target}.d.ts`))) throw new FoundationError("loader-selected-declaration");
  if (files.some((file) => /\/(@types|@module-federation|@pylons\/core|react|slf|debug)\/|lib\.dom|weaver|ghost/i.test(file)))
    throw new FoundationError("loader-declaration-backedge");
  if (files.some((file) => file.endsWith(`/@pylons/loader-mf/dist/${target === "browser" ? "server" : "browser"}.d.ts`)))
    throw new FoundationError("loader-unchosen-declaration");
}

function imports(source: string, path: string): readonly string[] {
  const file = ts.createSourceFile("graph.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const found: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
      found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) found.push(argument.text);
      else if (!path.endsWith("/@module-federation/runtime-core/dist/utils/load.js")) throw new FoundationError("loader-computed-import");
      // Universal vendor ESM/System alternatives are not the admitted global/commonjs profile.
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}

export async function loaderJavascript(cwd: string, target: "browser" | "server") {
  const modules = join(cwd, "node_modules");
  const pending = [join(modules, `@pylons/loader-mf/dist/${target}.js`)];
  const files = new Set<string>();
  while (pending.length) {
    const file = pending.pop();
    if (!file || files.has(file)) continue;
    if (files.size >= 200 || !file.startsWith(`${modules}/`) || (await realpath(file)) !== file) throw new FoundationError("loader-js-escape");
    files.add(file);
    for (const specifier of imports(await readFile(file, "utf8"), file)) pending.push(Bun.resolveSync(specifier, dirname(file)));
  }
  if ([...files].some((file) => /\/(@pylons\/core|react|slf|debug)\/|weaver|ghost/i.test(file))) throw new FoundationError("loader-js-backedge");
  if ([...files].some((file) => file.endsWith(`/@pylons/loader-mf/dist/${target === "browser" ? "server" : "browser"}.js`)))
    throw new FoundationError("loader-unchosen-js");
  return [...files].sort();
}
