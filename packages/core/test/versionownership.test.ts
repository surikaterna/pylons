import { expect, test } from "bun:test";
import { createVersionOwnership } from "../src/versionownership.js";
import { capability, extension, harness, plan, signal } from "./fixtures.js";

test("shared process ownership permits same version scoped instances but rejects conflicts before load", async () => {
  const versionOwnership = createVersionOwnership();
  const a = harness(plan(undefined, "r", "a"), {}, { versionOwnership });
  const b = harness(plan(undefined, "r", "b"), {}, { versionOwnership });
  await Promise.all([a.runtime.refresh(), b.runtime.refresh()]);
  expect((await a.runtime.demand(capability, signal())).success).toBe(true);
  expect((await b.runtime.demand(capability, signal())).success).toBe(true);
  expect(a.counts().activations).toBe(1);
  expect(b.counts().activations).toBe(1);
  await Promise.all([a.runtime.shutdown(), b.runtime.shutdown()]);
  const conflict = harness(plan([{ id: "base", version: "v2", entries: [extension()] }], "r", "c"), {}, { versionOwnership });
  await conflict.runtime.refresh();
  expect((await conflict.runtime.demand(capability, signal())).success).toBe(false);
  expect(conflict.counts().loads).toBe(0);
  expect(conflict.runtime.snapshots()[0]?.state).toBe("restart-required");
  await conflict.runtime.shutdown();
});
