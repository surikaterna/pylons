import { expect, test } from "bun:test";
import type { ConfigReplacement, PlanSource, ResolvedPlan, Result, SourceFailure } from "@pylons/contracts";
import { capability, deferred, extension, flush, harness, plan, request, signal } from "./fixtures.js";

test("opaque revisions are not sorted; desired/applied follow actual supported config result", async () => {
  const replacement = deferred<ConfigReplacement>();
  const started = deferred<string>();
  const h = harness(plan(undefined, "z"), {
    async replace(revision) {
      started.resolve(revision);
      return replacement.promise;
    },
  });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  h.setPlan(plan([{ id: "base", entries: [extension()], value: 8 }], "a"));
  const pending = h.runtime.refresh();
  expect(await started.promise).toBe("a");
  expect(h.runtime.snapshots()[0]?.generation.desiredRevision).toBe("a");
  expect(h.runtime.snapshots()[0]?.generation.appliedRevision).toBe("z");
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  replacement.resolve({ kind: "applied", appliedRevision: "a" });
  expect((await pending).success).toBe(true);
  expect(h.runtime.snapshots()[0]?.generation.appliedRevision).toBe("a");
  await h.runtime.shutdown();
});

test("unsupported replacement and failures never claim applied and disable stays closed", async () => {
  for (const kind of ["unsupported", "restart-required", "failed", "wrong-revision"]) {
    const hooks =
      kind === "unsupported"
        ? {}
        : {
            async replace(): Promise<ConfigReplacement> {
              if (kind === "restart-required") return { kind: "restart-required" };
              if (kind === "wrong-revision") return { kind: "applied", appliedRevision: "wrong" };
              return { kind: "failed", code: "replacement-failed" };
            },
          };
    const h = harness(undefined, hooks);
    await h.runtime.refresh();
    await h.runtime.demand(capability, signal());
    h.setPlan(plan([{ id: "base", entries: [extension()], value: 8 }], "r2"));
    await h.runtime.refresh();
    expect(h.runtime.snapshots()[0]?.generation.appliedRevision).toBe("r1");
    expect(h.runtime.snapshots()[0]?.generation.desiredRevision).toBe("r2");
    expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
    h.setPlan(plan([{ id: "base", entries: [extension()], enabled: false }], "r3"));
    await h.runtime.refresh();
    expect((await h.runtime.demand(capability, signal())).success).toBe(false);
    expect(h.runtime.snapshots()[0]?.state).toBe("disabled");
    await h.runtime.shutdown();
  }
});

test("source failure and invalid candidates do not renew finite prior validity", async () => {
  let sourceResult: Result<ResolvedPlan, SourceFailure> = { success: true, data: plan() };
  const source: PlanSource = {
    async read() {
      return sourceResult;
    },
  };
  const h = harness(undefined, {}, { source });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  sourceResult = { success: false, error: { code: "unavailable" } };
  expect((await h.runtime.refresh()).success).toBe(false);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  sourceResult = { success: true, data: plan(undefined, "new", "other") };
  expect((await h.runtime.refresh()).success).toBe(false);
  h.clock.advance(1000);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect(h.runtime.snapshots()[0]?.failureCode).toBe("expired");
  await h.runtime.shutdown();
  expect(h.clock.pending).toBe(0);
});

test("serialized coalesced reread discards superseded source result", async () => {
  const first = deferred<Result<ResolvedPlan, SourceFailure>>();
  let reads = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const source: PlanSource = {
    async read() {
      reads++;
      concurrent++;
      maxConcurrent = Math.max(concurrent, maxConcurrent);
      const result: Result<ResolvedPlan, SourceFailure> = reads === 1 ? await first.promise : { success: true, data: plan(undefined, "new") };
      concurrent--;
      return result;
    },
  };
  const h = harness(undefined, {}, { source });
  const one = h.runtime.refresh();
  const two = h.runtime.refresh();
  first.resolve({ success: true, data: plan(undefined, "old") });
  await Promise.all([one, two]);
  expect(reads).toBe(2);
  expect(maxConcurrent).toBe(1);
  expect(h.runtime.snapshots()[0]?.generation.desiredRevision).toBe("new");
  expect(h.events.some((event) => event.kind === "state-changed" && event.snapshot.generation.desiredRevision === "old")).toBe(false);
  await h.runtime.shutdown();
});

test("shutdown during replacement prevents late application", async () => {
  const replacing = deferred<string>();
  const completion = deferred<ConfigReplacement>();
  const h = harness(undefined, {
    async replace(revision) {
      replacing.resolve(revision);
      return completion.promise;
    },
  });
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  h.setPlan(plan([{ id: "base", entries: [extension()], value: 8 }], "r2"));
  const pending = h.runtime.refresh();
  await replacing.promise;
  await h.runtime.shutdown();
  completion.resolve({ kind: "applied", appliedRevision: "r2" });
  await pending;
  await flush();
  expect(h.runtime.snapshots()[0]?.generation.appliedRevision).toBe("r1");
  expect(h.runtime.snapshots()[0]?.state).toBe("stopped");
  expect(h.clock.pending).toBe(0);
});

test("explicit unauthorized source revokes ready admission before validity expires", async () => {
  let authorized = true;
  const h = harness(
    undefined,
    {},
    {
      source: {
        async read() {
          return authorized ? { success: true, data: plan() } : { success: false, error: { code: "unauthorized" } };
        },
      },
    },
  );
  await h.runtime.refresh();
  await h.runtime.demand(capability, signal());
  authorized = false;
  await h.runtime.refresh();
  expect(h.clock.now()).toBe(0);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect(h.runtime.metadata()).toHaveLength(0);
  await h.runtime.shutdown();
});
