import { expect, test } from "bun:test";
import { capabilityKey, compatible } from "../src/compatibility.js";
import type { PlanNode } from "../src/dependencyplan.js";
import { planDependencies } from "../src/dependencyplan.js";
import { createEventEmitter } from "../src/eventemitter.js";

function node(id: string, required: readonly string[] = []): PlanNode {
  return { id, required, missing: false };
}

test("emitter subscriptions, removal, fanout and terminal disposal", () => {
  const emitter = createEventEmitter<number>();
  const values: number[] = [];
  const first = emitter.event((value) => values.push(value));
  emitter.event(() => {
    throw new Error("private");
  });
  emitter.event((value) => values.push(value * 2));
  emitter.fire(1);
  first.dispose();
  emitter.fire(2);
  emitter.dispose();
  emitter.event((value) => values.push(value));
  emitter.fire(3);
  expect(values).toEqual([1, 2, 4]);
});

test("opaque versions are exact, not inferred ranges or normalized strings", () => {
  expect(compatible("^1.0.0", "1.2.0")).toBe(false);
  expect(compatible("revision", "revision")).toBe(true);
  expect(compatible("1", " 1")).toBe(false);
  expect(capabilityKey({ capabilityId: "x", contractVersion: "1:2" })).not.toBe(capabilityKey({ capabilityId: "x1", contractVersion: ":2" }));
});

test("self edges are cycles; missing edges block dependents without poisoning unrelated graphs", () => {
  const plan = planDependencies([node("self", ["self"]), node("missing", ["absent"]), node("down", ["missing"]), node("ok")]);
  expect(plan.cycles).toEqual(new Set(["self"]));
  expect(plan.blocked).toEqual(new Set(["missing", "down"]));
  expect(plan.layers).toEqual([["ok"]]);
});

test("multiple cycles distinguish actual members from downstream nodes", () => {
  const plan = planDependencies([node("a", ["b"]), node("b", ["a"]), node("c", ["c"]), node("d", ["b"]), node("p"), node("q", ["p"])]);
  expect(plan.cycles).toEqual(new Set(["a", "b", "c"]));
  expect(plan.blocked).toEqual(new Set(["d"]));
  expect(plan.layers).toEqual([["p"], ["q"]]);
});
