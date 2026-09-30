import { expect, test } from "bun:test";
import { isFactory } from "./factory-guard.js";
import { fixturePlan } from "./fixture-metadata.js";
import { admit } from "./metadata.js";

const origin = "http://127.0.0.1:4000/";
const artifact = {
  target: "bun",
  expose: "./factory",
  file: "bun/remoteEntry.js",
  bytes: 1,
  sha256: "a".repeat(64),
} satisfies import("./artifact-index.js").Artifact;
function plan() {
  return fixturePlan("cli", origin, artifact);
}

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("fixture-absent");
  return value;
}

test("metadata admission narrows readonly contracts without executable imports", () => {
  const result = admit(JSON.stringify(plan()), "cli", origin);
  expect(Object.isFrozen(result.plan)).toBe(true);
  expect(result.request.extension.activation.kind).toBe("demand-capability");
});

test("disabled, wrong scope, mixed revision, finite expiry and target/origin fail closed", () => {
  const disabled = plan();
  first(disabled.inventory.installations).enabled = false;
  const scope = plan();
  scope.inventory.scope.tenantId = "wrong";
  const revision = plan();
  first(revision.configs).revision = "mixed";
  const expired = plan();
  expired.inventory.validity.authorizedUntil = Date.now() - 1;
  const infinite = plan();
  infinite.inventory.validity.freshUntil = Infinity;
  const target = plan();
  first(first(target.inventory.installations).operatorBindings).locator = `${origin}browser/remoteEntry.js`;
  const foreign = plan();
  first(first(foreign.inventory.installations).operatorBindings).locator = "https://foreign.invalid/remoteEntry.js";
  for (const candidate of [disabled, scope, revision, expired, infinite, target, foreign]) {
    expect(() => admit(JSON.stringify(candidate), "cli", origin)).toThrow();
  }
});

test("factory guard rejects invalid exports", () => {
  for (const candidate of [null, {}, { activate: 1 }, [], "factory"]) expect(isFactory(candidate)).toBe(false);
});
