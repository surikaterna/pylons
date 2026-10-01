import { expect, test } from "bun:test";
import type { Result } from "@pylons/contracts";
import { createHttpPlanSource } from "../src/index.js";
import type { MetadataResponse, TransportFailure } from "../src/types.js";
import { Cancel, context, deferred, options, plan, TestClock } from "./fixtures.js";

type ResponseResult = Result<MetadataResponse, TransportFailure>;
function successful(revision = "z"): ResponseResult {
  return { success: true, data: { status: 200, body: JSON.stringify(plan(context, revision)) } };
}
test("latest local request wins despite opaque revision order and uncooperative late transport", async () => {
  const first = deferred<ResponseResult>();
  let reads = 0;
  const clock = new TestClock();
  const source = createHttpPlanSource({
    ...options("http://localhost", clock),
    transport: { read: async () => (++reads === 1 ? first.promise : successful("a")) },
  });
  const oldCancel = new Cancel();
  const old = source.read(context, oldCancel);
  await Promise.resolve();
  const latest = await source.read(context, new Cancel());
  expect(latest).toEqual({ success: true, data: plan(context, "a") });
  expect(await old).toEqual({ success: false, error: { code: "cancelled" } });
  first.resolve(successful("z"));
  await Promise.resolve();
  expect(clock.timers.size).toBe(0);
  expect(oldCancel.subscriptions).toBe(0);
});
test("latest cancelled read cannot revive older read", async () => {
  const pending = deferred<ResponseResult>();
  const source = createHttpPlanSource({ ...options("http://localhost"), transport: { read: () => pending.promise } });
  const first = source.read(context, new Cancel());
  const cancel = new Cancel();
  const second = source.read(context, cancel);
  cancel.cancel();
  pending.resolve(successful());
  expect(await first).toEqual({ success: false, error: { code: "cancelled" } });
  expect(await second).toEqual({ success: false, error: { code: "cancelled" } });
});
test("timeout releases own resources even when foreign transport never settles", async () => {
  const clock = new TestClock();
  const cancel = new Cancel();
  const source = createHttpPlanSource({ ...options("http://localhost", clock), transport: { read: () => new Promise(() => undefined) } });
  const result = source.read(context, cancel);
  clock.expire();
  expect(await result).toEqual({ success: false, error: { code: "cancelled" } });
  expect(clock.timers.size).toBe(0);
  expect(cancel.subscriptions).toBe(0);
});
test("read failure or later expiry never renews prior authorization", async () => {
  const clock = new TestClock();
  let reads = 0;
  const source = createHttpPlanSource({
    ...options("http://localhost", clock),
    transport: {
      async read() {
        return ++reads === 2 ? { success: false, error: { code: "unavailable" } } : successful();
      },
    },
  });
  expect((await source.read(context, new Cancel())).success).toBe(true);
  expect(await source.read(context, new Cancel())).toEqual({ success: false, error: { code: "unavailable" } });
  clock.time = 1501;
  expect(await source.read(context, new Cancel())).toEqual({ success: false, error: { code: "invalid-plan" } });
});
test("policy and clock finite bounds explicit, no universal TTL", async () => {
  for (const grant of [NaN, Infinity, -1, 0]) {
    const base = options("http://localhost");
    const source = createHttpPlanSource({
      ...base,
      authorization: {
        async authorize() {
          return { success: true, data: { sourceId: "fixture", authorizedUntil: 2000, maxFreshnessMilliseconds: grant } };
        },
      },
    });
    expect(await source.read(context, new Cancel())).toEqual({ success: false, error: { code: "unauthorized" } });
  }
});
test("all foreign boundary throws are redacted typed failures", async () => {
  const secret = new Error("https://private/?credential=config document stack");
  const base = options("http://localhost");
  const overrides = [
    {
      resolveEndpoint: () => {
        throw secret;
      },
    },
    {
      authorization: {
        authorize: async () => {
          throw secret;
        },
      },
    },
    {
      transport: {
        read: async () => {
          throw secret;
        },
      },
    },
    {
      clock: {
        now: () => {
          throw secret;
        },
        schedule: () => {
          throw secret;
        },
      },
    },
  ];
  for (const override of overrides) {
    expect(await createHttpPlanSource({ ...base, ...override }).read(context, new Cancel())).toEqual({ success: false, error: { code: "unavailable" } });
  }
});
test("injected oversize string is rejected too, with UTF8 byte accounting", async () => {
  const base = options("http://localhost");
  expect(
    await createHttpPlanSource({
      ...base,
      maxResponseBytes: 10,
      transport: {
        async read() {
          return { success: true, data: { status: 200, body: "😀😀😀" } };
        },
      },
    }).read(context, new Cancel()),
  ).toEqual({ success: false, error: { code: "invalid-plan" } });
});
