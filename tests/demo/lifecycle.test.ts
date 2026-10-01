import { describe, expect, test } from "bun:test";
import type { RuntimeSnapshot, RuntimeState } from "@pylons/contracts";
import type { MetadataEntry } from "@pylons/core";
import { LifecycleLabels, stateExplanation } from "../../apps/browser/lifecycle-model.js";

function snapshot(state: RuntimeState, generationId = "g1", tenantId = "a"): RuntimeSnapshot {
  return {
    generation: {
      scope: { hostId: "browser-demo", tenantId },
      definition: { pluginId: "basic-validation", definitionVersion: "1" },
      generationId,
      desiredRevision: "r2",
    },
    state,
  };
}
const metadata: readonly MetadataEntry[] = [
  {
    pluginId: "basic-validation",
    definitionVersion: "1",
    contributions: [
      { id: "validation", kind: "demo:validation", required: true, metadata: {}, provider: { capabilityId: "validation", contractVersion: "1" } },
    ],
  },
];

describe("selected-tenant lifecycle projection", () => {
  test("missing metadata, extension and applied revision stay honest", () => {
    const [row] = new LifecycleLabels().project([snapshot("blocked")], []);
    expect(row?.appliedRevision).toBe("not applied");
    expect(row?.capabilities).toBeUndefined();
    expect(row?.snapshot.extensionId).toBeUndefined();
    expect(row?.snapshot.failureCode).toBeUndefined();
    expect(row?.explanation).toContain("dependencies");
  });
  test("retains every generation and actual failure/restart revision", () => {
    const failed: RuntimeSnapshot = { ...snapshot("failed"), failureCode: "load-failed", extensionId: "provider" };
    const restarted: RuntimeSnapshot = { ...snapshot("restart-required", "g2"), generation: { ...snapshot("ready", "g2").generation, appliedRevision: "r1" } };
    const rows = new LifecycleLabels().project([failed, restarted], metadata);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.snapshot.generation.generationId)).toEqual(["g1", "g2"]);
    expect(rows[0]?.snapshot.failureCode).toBe("load-failed");
    expect(rows[1]?.snapshot.state).toBe("restart-required");
    expect(rows[1]?.appliedRevision).toBe("r1");
    expect(rows[1]?.snapshot.generation.desiredRevision).toBe("r2");
  });
  test("preserves observed definition labels, never guesses another version or tenant", () => {
    const labelsA = new LifecycleLabels();
    expect(labelsA.project([snapshot("ready")], metadata)[0]?.capabilities).toEqual(["validation@1"]);
    expect(labelsA.project([snapshot("stopped")], [])[0]?.capabilities).toEqual(["validation@1"]);
    const v2: RuntimeSnapshot = {
      ...snapshot("loading"),
      generation: { ...snapshot("loading").generation, definition: { pluginId: "basic-validation", definitionVersion: "2" } },
    };
    expect(labelsA.project([v2], [])[0]?.capabilities).toBeUndefined();
    const rowB = new LifecycleLabels().project([snapshot("blocked", "b1", "b")], [])[0];
    expect(rowB?.capabilities).toBeUndefined();
    expect(rowB?.snapshot.generation.scope.tenantId).toBe("b");
  });
  test("every public state has an explanation without inventing readiness", () => {
    for (const state of Object.keys(stateExplanation)) expect(stateExplanation).toHaveProperty(state);
    expect(Object.keys(stateExplanation)).toHaveLength(12);
    expect(new LifecycleLabels().project([snapshot("declaration-only")], [])[0]).not.toHaveProperty("ready");
  });
});
