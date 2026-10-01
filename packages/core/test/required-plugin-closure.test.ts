import { expect, test } from "bun:test";
import type { Extension } from "@pylons/contracts";
import { capability, extension, harness, plan, pluginDependency, request, signal } from "./fixtures.js";

test.each(["unsupported", "denied"])("required plugin blocks before load when a selected sibling is %s", async (rejection) => {
  const unrelated = { capabilityId: "unrelated", contractVersion: "opaque" };
  const bad: Extension = { ...extension("bad", [], []), hosts: rejection === "unsupported" ? ["browser"] : ["server"] };
  const h = harness(
    plan([
      { id: "consumer", entries: [{ ...extension(), activation: { kind: "startup" } }], dependencies: [pluginDependency("provider")] },
      { id: "provider", entries: [extension("good", [], []), bad] },
      { id: "unrelated", entries: [extension("unrelated", [], [unrelated])] },
    ]),
    {},
    {
      policy: {
        async evaluate(value) {
          return rejection === "denied" && value.extension?.id === "bad" ? { kind: "deny", code: "unauthorized" } : { kind: "allow" };
        },
      },
    },
  );
  expect((await h.runtime.refresh()).success).toBe(true);
  expect((await h.runtime.demand(capability, signal())).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(false);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect(h.counts().loads).toBe(0);
  const consumer = h.runtime.snapshots().find((value) => value.generation.definition.pluginId === "consumer");
  expect(consumer?.state).toBe("blocked");
  expect(consumer?.failureCode).toBe("dependency-missing");
  expect(h.runtime.snapshots().find((value) => value.extensionId === "bad")?.state).toBe(rejection);
  expect((await h.runtime.demand(unrelated, signal())).success).toBe(true);
  expect((await h.runtime.invoke(unrelated, null, request())).success).toBe(true);
  expect(h.counts().loads).toBe(1);
  await h.runtime.shutdown();
});

test.each(["unsupported", "denied"])("optional plugin with a %s sibling does not force activation or block consumer", async (rejection) => {
  const bad: Extension = { ...extension("bad", [], []), hosts: rejection === "unsupported" ? ["browser"] : ["server"] };
  const h = harness(
    plan([
      { id: "consumer", entries: [extension()], dependencies: [pluginDependency("provider", false)] },
      { id: "provider", entries: [extension("good", [], []), bad] },
    ]),
    {},
    {
      policy: {
        async evaluate(value) {
          return rejection === "denied" && value.extension?.id === "bad" ? { kind: "deny", code: "unauthorized" } : { kind: "allow" };
        },
      },
    },
  );
  await h.runtime.refresh();
  expect((await h.runtime.demand(capability, signal())).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(h.counts().loads).toBe(1);
  expect(h.counts().activations).toBe(1);
  expect(h.runtime.snapshots().find((value) => value.extensionId === "good")?.state).not.toBe("ready");
  await h.runtime.shutdown();
});
