import { expect, test } from "bun:test";
import ts from "typescript";

function inspect(source: ts.SourceFile, production: boolean): string[] {
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
    if (production && ts.isIdentifier(node) && ["window", "document", "process", "Bun", "AbortSignal", "AbortController", "setTimeout"].includes(node.text))
      failures.push("non-neutral-global");
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (nesting(source) > 3) failures.push("nesting-depth");
  if (source.text.split("\n").length > 400) failures.push("file-size");
  return failures;
}

function nesting(node: ts.Node, depth = 0): number {
  const callable = ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node);
  const control =
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node);
  const current = callable ? 0 : depth + (control ? 1 : 0);
  let maximum = current;
  ts.forEachChild(node, (child) => {
    maximum = Math.max(maximum, nesting(child, current));
  });
  return maximum;
}

test("core source and tests enforce size/type/export principles", async () => {
  const root = `${import.meta.dir}/..`;
  for await (const path of new Bun.Glob("{src,test}/*.ts").scan({ cwd: root })) {
    const source = ts.createSourceFile(path, await Bun.file(`${root}/${path}`).text(), ts.ScriptTarget.Latest, true);
    expect(inspect(source, path.startsWith("src/")), path).toEqual([]);
  }
});
