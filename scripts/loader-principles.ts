import ts from "typescript";
import { FoundationError } from "./policy.js";

function callable(
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
  if (callable(node)) return depth;
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

export function loaderPrinciples(source: string, path: string) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lines = source.trimEnd().split("\n").length;
  if (lines > 400) throw new FoundationError(`principles-file:${path}`);
  let functionLines = 0;
  let maximumNesting = 0;
  function visit(node: ts.Node) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || node.kind === ts.SyntaxKind.AnyKeyword)
      throw new FoundationError(`principles-types:${path}`);
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
      throw new FoundationError(`principles-default:${path}`);
    if (callable(node) && node.body) {
      const size = file.getLineAndCharacterOfPosition(node.end).line - file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      functionLines = Math.max(functionLines, size);
      maximumNesting = Math.max(maximumNesting, nesting(node.body));
      if (size >= 50 || maximumNesting > 3) throw new FoundationError(`principles-function:${path}:${size}:${maximumNesting}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { lines, functionLines, maximumNesting };
}
