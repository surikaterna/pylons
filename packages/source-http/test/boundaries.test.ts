import { expect, test } from "bun:test";
import type { Result } from "@pylons/contracts";
import { createHttpDefinitionCatalog, createHttpPlanSource } from "../src/index.js";
import type { HttpSourceOptions, MetadataResponse, TransportFailure } from "../src/types.js";
import { Cancel, context, deferred, definition, options, plan, TestClock } from "./fixtures.js";

test("catalog snapshots externally verified context at construction and requested ref at read", async () => {
  const input = { scope: { ...context.scope }, authorizationId: context.authorizationId };
  const ref = { ...definition };
  const pending = deferred<Result<MetadataResponse, TransportFailure>>();
  const catalog = createHttpDefinitionCatalog({ ...options("http://localhost"), transport: { read: () => pending.promise } }, input);
  input.scope.tenantId = "other";
  input.authorizationId = "other";
  const result = catalog.read(ref, new Cancel());
  ref.pluginId = "other";
  pending.resolve({ success: true, data: { status: 200, body: JSON.stringify(plan()) } });
  const expected = plan().definitions[0];
  if (!expected) throw new Error("Missing fixture");
  expect(await result).toEqual({ success: true, data: expected });
});
test("plan read snapshots verified context across policy and transport awaits", async () => {
  const input = { scope: { ...context.scope }, authorizationId: context.authorizationId };
  const pending = deferred<Result<MetadataResponse, TransportFailure>>();
  const source = createHttpPlanSource({ ...options("http://localhost"), transport: { read: () => pending.promise } });
  const result = source.read(input, new Cancel());
  input.scope.tenantId = "other";
  input.authorizationId = "other";
  pending.resolve({ success: true, data: { status: 200, body: JSON.stringify(plan()) } });
  expect(await result).toEqual({ success: true, data: plan() });
});
test("expiry crossed while transport is pending rejects completion", async () => {
  const clock = new TestClock();
  const pending = deferred<Result<MetadataResponse, TransportFailure>>();
  const source = createHttpPlanSource({ ...options("http://localhost", clock), transport: { read: () => pending.promise } });
  const result = source.read(context, new Cancel());
  await Promise.resolve();
  clock.time = 1500;
  pending.resolve({ success: true, data: { status: 200, body: JSON.stringify(plan()) } });
  expect(await result).toEqual({ success: false, error: { code: "invalid-plan" } });
});
test("revocation of same authorization identity cannot fall back to cached success", async () => {
  let revoked = false;
  let reads = 0;
  const base = options("http://localhost");
  const source = createHttpPlanSource({
    ...base,
    authorization: {
      async authorize(request, endpoint, cancellation) {
        return revoked ? { success: false, error: { code: "unauthorized" } } : base.authorization.authorize(request, endpoint, cancellation);
      },
    },
    transport: {
      async read() {
        reads++;
        return { success: true, data: { status: 200, body: JSON.stringify(plan()) } };
      },
    },
  });
  expect((await source.read(context, new Cancel())).success).toBe(true);
  revoked = true;
  expect(await source.read(context, new Cancel())).toEqual({ success: false, error: { code: "unauthorized" } });
  expect(reads).toBe(1);
});
test("policy never called for pre-cancelled read and no resources acquired", async () => {
  const base = options("http://localhost");
  const cancel = new Cancel();
  cancel.cancel();
  const source = createHttpPlanSource({
    ...base,
    authorization: {
      async authorize() {
        throw new Error("must not run");
      },
    },
  });
  expect(await source.read(context, cancel)).toEqual({ success: false, error: { code: "cancelled" } });
  expect(cancel.subscriptions).toBe(0);
});
test("bad option bounds fail closed without transport", async () => {
  const base = options("http://localhost");
  const invalid: readonly Partial<HttpSourceOptions>[] = [
    { maxResponseBytes: Infinity },
    { maxResponseBytes: 1.5 },
    { maxResponseBytes: 0 },
    { timeoutMilliseconds: NaN },
    { timeoutMilliseconds: Infinity },
    { timeoutMilliseconds: 0 },
  ];
  for (const override of invalid)
    expect(await createHttpPlanSource({ ...base, ...override }).read(context, new Cancel())).toEqual({ success: false, error: { code: "unavailable" } });
});
test("throwing cleanup still attempts every own release", async () => {
  const base = options("http://localhost");
  let releases = 0;
  const source = createHttpPlanSource({
    ...base,
    clock: {
      now: () => 1000,
      schedule: () => ({
        dispose() {
          releases++;
          throw new Error("private-clock");
        },
      }),
    },
    transport: {
      async read() {
        return { success: true, data: { status: 200, body: JSON.stringify(plan()) } };
      },
    },
  });
  expect(
    (
      await source.read(context, {
        cancelled: false,
        onCancel: () => ({
          dispose() {
            releases++;
            throw new Error("private-subscription");
          },
        }),
      })
    ).success,
  ).toBe(true);
  expect(releases).toBe(2);
});
test("real HTTP latest read supersedes earlier deferred HTTP response", async () => {
  const entered = deferred<void>();
  const held = deferred<Response>();
  let reads = 0;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      if (++reads === 1) {
        entered.resolve();
        return held.promise;
      }
      return Response.json(plan(context, "a"));
    },
  });
  try {
    const source = createHttpPlanSource(options(server.url.href));
    const first = source.read(context, new Cancel());
    await entered.promise;
    expect(await source.read(context, new Cancel())).toEqual({ success: true, data: plan(context, "a") });
    held.resolve(Response.json(plan(context, "z")));
    expect(await first).toEqual({ success: false, error: { code: "cancelled" } });
  } finally {
    held.resolve(new Response());
    server.stop(true);
  }
});
