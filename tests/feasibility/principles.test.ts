import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { isObject } from "./artifact-index.js";

const root = resolve(import.meta.dir, "../..");

test("contracts compiler stays explicitly no-DOM despite private browser tooling", async () => {
  const value: unknown = JSON.parse(await readFile(resolve(root, "packages/contracts/tsconfig.json"), "utf8"));
  if (!isObject(value) || !isObject(value.compilerOptions)) throw new Error("invalid-contract-compiler");
  expect(value.compilerOptions.lib).toEqual(["ES2022"]);
  expect(value.compilerOptions.types).toEqual([]);
  expect(value.compilerOptions.skipLibCheck).toBe(false);
});

function inspect(source: ts.SourceFile): string[] {
  const failures: string[] = [];
  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))
      failures.push("unsafe-type");
    if (ts.isExportAssignment(node)) failures.push("default-export");
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) {
      const first = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const last = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      if (last - first + 1 >= 50) failures.push(`function-size:${first + 1}:${last - first + 1}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (source.text.split("\n").length > 400) failures.push("file-size");
  return failures;
}

test("private feasibility sources enforce size/type/export principles", async () => {
  const patterns = ["apps/**/*.ts", "plugins/basic-validation/src/**/*.ts", "tests/feasibility/**/*.ts", "scripts/feasibility-*.ts"];
  for (const pattern of patterns) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root })) {
      const source = ts.createSourceFile(path, await readFile(resolve(root, path), "utf8"), ts.ScriptTarget.Latest, true);
      expect(inspect(source), path).toEqual([]);
    }
  }
});
