import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

function functionNode(
  node: ts.Node,
): node is ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.ConstructorDeclaration | ts.GetAccessorDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node)
  );
}
function nesting(node: ts.Node, depth = 0): number {
  if (functionNode(node)) return depth;
  const control =
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isSwitchStatement(node);
  const alternative = ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
  const next = depth + Number(control && !alternative);
  let maximum = next;
  ts.forEachChild(node, (child) => {
    maximum = Math.max(maximum, nesting(child, next));
  });
  return maximum;
}
function inspect(source: string, path: string): { readonly lines: number; readonly maxFunction: number; readonly maxNesting: number } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lines = source.trimEnd().split("\n").length;
  let maxFunction = 0;
  let maxNesting = 0;
  expect(lines).toBeLessThanOrEqual(400);
  function visit(node: ts.Node): void {
    expect(ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || node.kind === ts.SyntaxKind.AnyKeyword).toBe(false);
    if (ts.canHaveModifiers(node)) expect(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false).toBe(false);
    if (functionNode(node) && node.body) {
      const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
      const end = file.getLineAndCharacterOfPosition(node.end).line;
      maxFunction = Math.max(maxFunction, end - start + 1);
      maxNesting = Math.max(maxNesting, nesting(node.body));
      expect(end - start + 1).toBeLessThan(50);
      expect(nesting(node.body)).toBeLessThanOrEqual(3);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { lines, maxFunction, maxNesting };
}
test("new HTTP production source follows size, complexity, narrow-type and named-export principles", async () => {
  const root = join(import.meta.dir, "../packages/source-http/src");
  for (const name of await readdir(root)) console.log(`Source principles ${name} ${JSON.stringify(inspect(await readFile(join(root, name), "utf8"), name))}`);
});

test("assigned package validation tooling follows the same production principles", async () => {
  const files = [
    "build",
    "check",
    "closure",
    "inventory",
    "package-policy",
    "policy",
    "candidate-evidence",
    "source-build",
    "source-e2e",
    "source-consumer-fixture",
    "source-browser-consumer",
    "verify-source-package",
  ];
  for (const name of files) {
    const path = join(import.meta.dir, `../scripts/${name}.ts`);
    console.log(`Source tooling principles ${name} ${JSON.stringify(inspect(await readFile(path, "utf8"), name))}`);
  }
});
