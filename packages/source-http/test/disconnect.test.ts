import { expect, test } from "bun:test";
import { createFetchTransport } from "../src/fetch.js";
import { createHttpPlanSource } from "../src/index.js";
import { Cancel, context, deferred, options, TestClock } from "./fixtures.js";

test("real hanging HTTP stream aborts underlying connection on caller cancellation and timeout", async () => {
  for (const terminal of ["cancel", "timeout"]) {
    const entered = deferred<void>();
    const disconnected = deferred<void>();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        request.signal.addEventListener("abort", () => disconnected.resolve());
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"));
              entered.resolve();
            },
            cancel() {
              disconnected.resolve();
            },
          }),
        );
      },
    });
    const cancel = new Cancel();
    const clock = new TestClock();
    try {
      const pending = createHttpPlanSource(options(server.url.href, clock)).read(context, cancel);
      await entered.promise;
      if (terminal === "cancel") cancel.cancel();
      else clock.expire();
      expect(await pending).toEqual({ success: false, error: { code: "cancelled" } });
      await disconnected.promise;
      expect(clock.timers.size).toBe(0);
      expect(cancel.subscriptions).toBe(0);
    } finally {
      server.stop(true);
    }
  }
});

test("real declared oversized valid JSON is rejected by transport before parsing", async () => {
  const body = `{}${" ".repeat(9998)}`;
  const server = Bun.listen({
    port: 0,
    hostname: "127.0.0.1",
    socket: {
      data(socket) {
        socket.end(`HTTP/1.1 200 OK\r\nContent-Length: 10000\r\nConnection: close\r\n\r\n${body}`);
      },
    },
  });
  try {
    const result = await createFetchTransport().read({
      endpoint: { url: `http://127.0.0.1:${server.port}`, headers: {} },
      maxBytes: 100,
      cancellation: new Cancel(),
    });
    expect(result).toEqual({ success: false, error: { code: "oversize" } });
  } finally {
    server.stop(true);
  }
});

test("real oversized never-ending stream is cancelled without unbounded consumption", async () => {
  const disconnected = deferred<void>();
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      request.signal.addEventListener("abort", () => disconnected.resolve());
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(8192));
          },
          cancel() {
            disconnected.resolve();
          },
        }),
      );
    },
  });
  try {
    expect(await createHttpPlanSource(options(server.url.href)).read(context, new Cancel())).toEqual({ success: false, error: { code: "invalid-plan" } });
    await disconnected.promise;
  } finally {
    server.stop(true);
  }
});
test("real stream disconnect returns safe failure and natural completion cleans subscriptions", async () => {
  const server = Bun.listen({
    port: 0,
    hostname: "127.0.0.1",
    socket: {
      data(socket) {
        socket.end("HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{");
      },
    },
  });
  const cancel = new Cancel();
  const clock = new TestClock();
  try {
    expect(await createHttpPlanSource(options(`http://127.0.0.1:${server.port}`, clock)).read(context, cancel)).toEqual({
      success: false,
      error: { code: "unavailable" },
    });
    expect(clock.timers.size).toBe(0);
    expect(cancel.subscriptions).toBe(0);
  } finally {
    server.stop(true);
  }
});
