import { expect, test } from "bun:test";
import { LoggerFactory, type Middleware } from "slf";
import { HttpBoundary } from "../../apps/web-server/http-boundary.js";
import type { activate } from "./activation.js";
import { CleanupFailure, cleanupResources } from "./cleanup.js";

const secret = "SECRET_DOCUMENT_CONFIG_HEADER_ERROR_SENTINEL";
const metadata = { contributions: [], selected: "validation" };
const request = (path: string) => new Request(`http://localhost/${path}?title=${secret}`);

test("bounded cleanup attempts all resources despite throw, typed failure and timeout", async () => {
  const attempted: string[] = [];
  const resources = [
    {
      async cleanup() {
        attempted.push("throw");
        throw new Error(secret);
      },
    },
    {
      cleanup() {
        attempted.push("pending");
        return new Promise<never>(() => {});
      },
    },
    {
      async cleanup() {
        attempted.push("typed-failure");
        return { success: false, error: { code: "cleanup-failed" } } satisfies import("@pylons/contracts").Result<
          undefined,
          import("@pylons/contracts").CleanupFailure
        >;
      },
    },
    {
      async cleanup() {
        attempted.push("last");
        return { success: true, data: undefined } satisfies import("@pylons/contracts").Result<undefined, import("@pylons/contracts").CleanupFailure>;
      },
    },
  ];
  await expect(cleanupResources(resources, 5)).rejects.toBeInstanceOf(CleanupFailure);
  expect(attempted).toEqual(["throw", "pending", "typed-failure", "last"]);
});

test("HTTP failure rejects raw errors before facade/middleware/queue and stops rejected activation", async () => {
  const seen: string[] = [];
  const middleware: Middleware = (event, next) => {
    seen.push(JSON.stringify(event.params));
    next(null, event);
  };
  LoggerFactory.use(middleware);
  let stops = 0;
  const boundary = new HttpBoundary(
    metadata,
    async () => {
      throw new Error(secret);
    },
    () => {
      stops++;
    },
    20,
  );
  try {
    const validation = await boundary.fetch(request("validate"));
    expect(validation.status).toBe(503);
    expect(await validation.text()).toBe('{"error":{"code":"request-failed"}}');
    const shutdown = await boundary.fetch(request("shutdown"));
    expect(shutdown.status).toBe(503);
    expect(await shutdown.text()).toBe('{"error":{"code":"shutdown-failed"}}');
    expect(stops).toBe(1);
    expect(seen.join(" ")).not.toContain("SENTINEL");
    expect(JSON.stringify(globalThis.__slf._queued)).not.toContain("SENTINEL");
    expect(seen.join(" ")).toContain("http activation-failed");
  } finally {
    LoggerFactory.remove(middleware);
  }
});

test("HTTP shutdown always tears down after rejecting cleanup or an unsettled activation", async () => {
  let stops = 0;
  const session: Awaited<ReturnType<typeof activate>> = {
    counts: () => ({ activations: 1, invocations: 0, stopped: true }),
    async invoke() {
      throw new Error(secret);
    },
    async stop() {
      throw new Error(secret);
    },
  };
  const boundary = new HttpBoundary(
    metadata,
    async () => session,
    () => {
      stops++;
    },
    10,
  );
  expect((await boundary.fetch(request("validate"))).status).toBe(503);
  const shutdown = await boundary.fetch(request("shutdown"));
  expect(await shutdown.text()).toBe('{"error":{"code":"shutdown-failed"}}');
  expect(stops).toBe(1);
  const pending = new HttpBoundary(
    metadata,
    () => new Promise<never>(() => {}),
    () => {
      stops++;
    },
    5,
  );
  expect((await pending.fetch(request("validate"))).status).toBe(503);
  expect((await pending.fetch(request("shutdown"))).status).toBe(503);
  expect(stops).toBe(2);
});
