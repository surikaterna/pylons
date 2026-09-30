import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { FoundationError } from "./policy.js";

export async function hostGraph(root: string, host: string): Promise<readonly string[]> {
  const pending = [resolve(root, `apps/${host}/main.ts`)];
  const visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    const path = relative(root, file);
    if (path.startsWith("..") || path.startsWith("plugins/") || path.startsWith("packages/contracts/test"))
      throw new FoundationError("Forbidden host implementation edge");
    visited.add(file);
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith(".")) continue;
      pending.push(resolve(dirname(file), specifier.text.replace(/\.js$/, ".ts")));
    }
    if (visited.size > 50) throw new FoundationError("Host graph exceeds private bound");
  }
  return [...visited].map((file) => relative(root, file)).sort();
}

export async function executableInventory(output: string) {
  const expected = ["author/factory.js", "browser/remoteEntry.js", "bun/remoteEntry.js", "hosts/browser.js", "hosts/cli.js", "hosts/web-server.js"].sort();
  const actual = (await readdir(output, { recursive: true })).filter((file) => file.endsWith(".js")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new FoundationError("Unaccounted generated executable");
  return Promise.all(
    actual.map(async (file) => {
      const bytes = await readFile(resolve(output, file));
      return { file, bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
    }),
  );
}
