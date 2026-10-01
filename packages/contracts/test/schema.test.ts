import { expect, test } from "bun:test";
import { parseConfigSideband, parseInstallationInventory, parsePluginDefinition, parseResolvedPlan } from "../src/index.js";
import { binding, config, definition, extension, inventory, plan } from "./fixtures.js";

test("canonical data accepts zero executable entries and typed provider metadata", () => {
  const result = parsePluginDefinition(definition());
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("fixture rejected");
  expect(result.data.extensions).toEqual([]);
  expect(result.data.contributions[0]?.provider?.contractVersion).toBe("1");
  expect(parseResolvedPlan(plan()).success).toBe(true);
  expect(parseResolvedPlan(plan(true)).success).toBe(true);
});

test.each([
  "displayName",
  "routes",
  "predicate",
  "when",
  "hidden",
  "activationEvents",
  "activations",
  "manifest",
  "ghost",
  "entry",
])("legacy %s is intentionally not a canonical envelope field", (key) => {
  expect(parsePluginDefinition({ ...definition(), [key]: {} }).success).toBe(false);
});

test.each([
  { identity: { pluginId: "", name: "Example", definitionVersion: "2" } },
  { schemaVersion: 2 },
  { contributions: [{ id: "c", kind: "unnamespaced", required: true, metadata: {} }] },
  { contributions: [{ id: "c", kind: "example:test", metadata: {} }] },
  { contributions: [{ id: "c", kind: "example:test", required: true }] },
  { contributions: [{ id: "c", kind: "example:test", required: true, metadata: {}, hidden: true }] },
  { extensions: [{ ...extension, artifactKey: "https://invalid" }] },
  { extensions: [{ ...extension, hosts: ["server", "server"] }] },
  { extensions: [{ ...extension, activation: { kind: "onStartup" } }] },
  { extensions: [{ ...extension, dependencies: [{ kind: "plugin", definition: { pluginId: "a", definitionVersion: "1" } }] }] },
])("rejects malformed, missing and unknown nested fields: %p", (variation) => {
  expect(parsePluginDefinition({ ...definition(), ...variation }).success).toBe(false);
});

test("accepts explicit required and optional dependencies, independent versions and startup", () => {
  expect(
    parsePluginDefinition({
      ...definition(true),
      extensions: [{ ...extension, activation: { kind: "startup" } }],
      dependencies: [
        { kind: "plugin", definition: { pluginId: "other", definitionVersion: "release-x" }, required: true },
        { kind: "capability", capability: { capabilityId: "external", contractVersion: "contract-y" }, required: false },
      ],
    }).success,
  ).toBe(true);
  expect(parseInstallationInventory(inventory(true)).success).toBe(true);
  expect(parseConfigSideband(config()).success).toBe(true);
});

test.each([
  undefined,
  NaN,
  Infinity,
  -Infinity,
  1n,
  () => 1,
  Symbol("secret"),
  new Date(),
  new Map(),
  new Set(),
  /x/,
])("rejects non-JSON metadata %p", (metadata) => {
  expect(parsePluginDefinition({ ...definition(), contributions: [{ id: "c", kind: "example:test", required: true, metadata }] }).success).toBe(false);
  expect(parseConfigSideband({ ...config(), values: metadata }).success).toBe(false);
});

test("rejects cycles but accepts repeated acyclic references and owns a detached immutable JSON snapshot", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(parseConfigSideband({ ...config(), values: cycle })).toEqual({ success: false, error: { code: "invalid-json", issues: [] } });
  const shared = { secret: "before" };
  const result = parseConfigSideband({ ...config(), values: { left: shared, right: shared } });
  shared.secret = "after";
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.values).toEqual({ left: { secret: "before" }, right: { secret: "before" } });
    expect(Object.isFrozen(result.data.values)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
  }
});

test("never invokes getters; rejects sparse arrays, array extras, symbols, class instances and graph budgets", () => {
  let invoked = false;
  const accessor = {
    get secret() {
      invoked = true;
      return "secret";
    },
  };
  const extra = Object.assign([1], { extra: true });
  class Instance {
    value = 1;
  }
  for (const values of [accessor, new Array(2), extra, { [Symbol("hidden")]: 1 }, new Instance(), "x".repeat(1_000_001), Array(10_001).fill(null)]) {
    expect(parseConfigSideband({ ...config(), values }).success).toBe(false);
  }
  let deep: unknown = null;
  for (let index = 0; index < 66; index++) deep = [deep];
  expect(parseConfigSideband({ ...config(), values: deep }).success).toBe(false);
  expect(invoked).toBe(false);
});

test("preserves and validates own JSON __proto__ and constructor keys without prototype pollution", () => {
  const values: unknown = JSON.parse('{"__proto__":{"minimum":8},"constructor":"valid"}');
  const result = parseConfigSideband({ ...config(), values });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(JSON.stringify(result.data.values)).toBe(JSON.stringify(values));
    expect(Object.hasOwn(Object(result.data.values), "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.data.values)).toBe(Object.prototype);
  }
  expect(parseConfigSideband({ ...config(), values: { ["__proto__"]: { invalid: () => 1 } } }).success).toBe(false);
});

test("errors carry only safe paths/categories and bounded issue counts, never rejected keys/values/errors", () => {
  const result = parsePluginDefinition({
    ...definition(),
    identity: { pluginId: "secret-key-value", name: 42, definitionVersion: "1", "secret-unknown-key": "secret-value" },
  });
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain("message");
  const many = parsePluginDefinition({ ...definition(), contributions: Array(100).fill({}) });
  if (!many.success) expect(many.error.issues.length).toBeLessThanOrEqual(32);
});

test.each([
  { contributions: [definition().contributions[0], definition().contributions[0]] },
  { extensions: [extension, extension] },
])("rejects duplicate declaration identities %p", (variation) => {
  expect(parsePluginDefinition({ ...definition(), ...variation }).success).toBe(false);
});

test("rejects duplicate installs, selected extensions and bindings", () => {
  const base = inventory(true);
  const installation = base.installations[0];
  if (!installation) throw new Error("fixture");
  for (const installations of [
    [installation, installation],
    [{ ...installation, selectedExtensions: ["validation", "validation"] }],
    [{ ...installation, operatorBindings: [binding, binding] }],
  ]) {
    expect(parseInstallationInventory({ ...base, installations }).success).toBe(false);
  }
});

test.each([
  { configs: [config("other")] },
  { configs: [config("tenant-a", "mixed")] },
  { configs: [] },
  { configs: [config(), config()] },
  { configs: [{ ...config(), definition: { pluginId: "unknown", definitionVersion: "1" } }] },
  { definitions: [] },
  { definitions: [definition(true), definition(true)] },
  { provenance: { sourceId: "fixture", revision: "mixed", authorizationId: "verified" } },
])("resolved plan rejects mixed provenance/unresolved/duplicate references %p", (variation) => {
  expect(parseResolvedPlan({ ...plan(true), ...variation }).success).toBe(false);
});

test("rejects unresolved selected extensions and missing, extra or mismatched bindings", () => {
  for (const operatorBindings of [
    [],
    [{ ...binding, artifactKey: "wrong" }],
    [{ ...binding, extensionId: "unknown" }],
    [binding, { ...binding, extensionId: "extra" }],
  ]) {
    const installation = { definition: config().definition, enabled: true, selectedExtensions: ["validation"], operatorBindings };
    expect(parseResolvedPlan({ ...plan(true), inventory: { ...inventory(true), installations: [installation] } }).success).toBe(false);
  }
  expect(parseResolvedPlan({ ...plan(true), definitions: [definition()] }).success).toBe(false);
});

test("finite validity and SHA256 syntax are checked, not expiry, trust, compatibility or dependency cycles", () => {
  expect(parseInstallationInventory({ ...inventory(), validity: { freshUntil: Infinity, authorizedUntil: 100 } }).success).toBe(false);
  expect(
    parseInstallationInventory({
      ...inventory(true),
      installations: [
        {
          definition: config().definition,
          enabled: true,
          selectedExtensions: ["validation"],
          operatorBindings: [{ ...binding, integrity: { algorithm: "sha256", digest: "invalid" } }],
        },
      ],
    }).success,
  ).toBe(false);
  expect(parseResolvedPlan({ ...plan(), inventory: { ...inventory(), validity: { freshUntil: 0, authorizedUntil: 0 } } }).success).toBe(true);
  expect(parsePluginDefinition({ ...definition(), dependencies: [{ kind: "plugin", definition: config().definition, required: true }] }).success).toBe(true);
});

test("strict installation/config/binding envelopes reject unknown fields and absent sideband values", () => {
  expect(parseConfigSideband({ ...config(), extra: "private" }).success).toBe(false);
  const { values: _values, ...missingValues } = config();
  expect(parseConfigSideband(missingValues).success).toBe(false);
  expect(parseInstallationInventory({ ...inventory(), scope: { ...inventory().scope, userId: "extra" } }).success).toBe(false);
  const selected = inventory(true).installations[0];
  if (!selected) throw new Error("fixture");
  expect(parseInstallationInventory({ ...inventory(true), installations: [{ ...selected, operatorBindings: [{ ...binding, host: "extra" }] }] }).success).toBe(
    false,
  );
});

test("inspection failures remain bounded safe results and no nonenumerable/class-array input slips through", () => {
  const throwing = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("private-stack-value");
      },
    },
  );
  expect(parseConfigSideband({ ...config(), values: throwing })).toEqual({ success: false, error: { code: "invalid-json", issues: [] } });
  const hidden = Object.defineProperty({}, "private", { value: 1 });
  class CustomArray extends Array<number> {}
  for (const values of [hidden, new CustomArray(1)]) expect(parseConfigSideband({ ...config(), values }).success).toBe(false);
  const nullPrototype: unknown = Object.assign(Object.create(null), { minimum: 3 });
  expect(parseConfigSideband({ ...config(), values: nullPrototype }).success).toBe(true);
});
