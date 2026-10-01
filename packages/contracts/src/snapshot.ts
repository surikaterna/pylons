import type { JsonValue } from "./json.js";

export class SnapshotFailure extends Error {
  override readonly name = "SnapshotFailure";
}

interface Budget {
  remaining: number;
  characters: number;
  readonly active: Set<object>;
}

function fail(): never {
  throw new SnapshotFailure();
}

function primitive(value: unknown, budget: Budget): JsonValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : fail();
  if (typeof value !== "string") return undefined;
  budget.characters -= value.length;
  if (budget.characters < 0) fail();
  return value;
}

function entries(value: object, remaining: number): readonly (readonly [string, unknown])[] {
  const keys = Reflect.ownKeys(value);
  if (keys.length > remaining + 1) fail();
  const pairs: (readonly [string, unknown])[] = [];
  for (const key of keys) {
    if (typeof key !== "string") fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) fail();
    if (Array.isArray(value) && key === "length") continue;
    if (!descriptor.enumerable) fail();
    pairs.push([key, descriptor.value]);
  }
  return pairs;
}

function arraySnapshot(value: readonly unknown[], pairs: readonly (readonly [string, unknown])[], budget: Budget, depth: number): JsonValue {
  if (pairs.length !== value.length) fail();
  const output: JsonValue[] = [];
  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];
    if (!pair || pair[0] !== String(index)) fail();
    output.push(clone(pair[1], budget, depth + 1));
  }
  return Object.freeze(output);
}

function objectSnapshot(pairs: readonly (readonly [string, unknown])[], budget: Budget, depth: number): JsonValue {
  const output: { [key: string]: JsonValue } = {};
  for (const [key, value] of pairs) {
    budget.characters -= key.length;
    if (budget.characters < 0) fail();
    Object.defineProperty(output, key, { value: clone(value, budget, depth + 1), enumerable: true });
  }
  return Object.freeze(output);
}

function clone(value: unknown, budget: Budget, depth: number): JsonValue {
  if (--budget.remaining < 0 || depth > 64) fail();
  const scalar = primitive(value, budget);
  if (scalar !== undefined) return scalar;
  if (typeof value !== "object" || value === null || budget.active.has(value)) fail();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail();
  budget.active.add(value);
  try {
    const pairs = entries(value, budget.remaining);
    return Array.isArray(value) ? arraySnapshot(value, pairs, budget, depth) : objectSnapshot(pairs, budget, depth);
  } finally {
    budget.active.delete(value);
  }
}

export function snapshotJson(value: unknown): JsonValue {
  return clone(value, { remaining: 10_000, characters: 1_000_000, active: new Set() }, 0);
}
