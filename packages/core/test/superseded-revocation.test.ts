import { expect, test } from "bun:test";
import type { ResolvedPlan, Result, SourceFailure } from "@pylons/contracts";
import { capability, deferred, extension, harness, plan, request, signal } from "./fixtures.js";

test("superseded unauthorized read revokes startup and demand during the next read gap and unavailable result", async () => {
  const selected = plan([{ id: "base", entries: [{ ...extension(), activation: { kind: "startup" } }] }]);
  const unauthorized = deferred<Result<ResolvedPlan, SourceFailure>>();
  const next = deferred<Result<ResolvedPlan, SourceFailure>>();
  const nextStarted = deferred<undefined>();
  let reads = 0;
  const h = harness(
    selected,
    {},
    {
      source: {
        async read() {
          reads++;
          if (reads === 1 || reads >= 4) return { success: true, data: selected };
          if (reads === 2) return unauthorized.promise;
          nextStarted.resolve(undefined);
          return next.promise;
        },
      },
    },
  );
  await h.runtime.refresh();
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  const first = h.runtime.refresh();
  const coalesced = h.runtime.refresh();
  unauthorized.resolve({ success: false, error: { code: "unauthorized" } });
  await nextStarted.promise;
  expect(reads).toBe(3);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect((await h.runtime.demand(capability, signal())).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(false);
  next.resolve({ success: false, error: { code: "unavailable" } });
  await Promise.all([first, coalesced]);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(false);
  expect(h.counts().calls).toBe(1);
  expect(h.counts().activations).toBe(1);
  expect(h.clock.now()).toBe(0);
  expect((await h.runtime.refresh()).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(false);
  expect((await h.runtime.startup()).success).toBe(true);
  expect((await h.runtime.invoke(capability, null, request())).success).toBe(true);
  expect(h.counts().activations).toBe(2);
  await h.runtime.shutdown();
});
