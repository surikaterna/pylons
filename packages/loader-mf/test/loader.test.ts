import { expect, test } from "bun:test";
import { cancelSource, fixture } from "../../../scripts/loader-fixture.js";
import { loader } from "../src/loader.js";
import { checkedBytes } from "../src/transport.js";

let serial = 0;
function setup() {
  const data = fixture("https://approved.invalid/", "server", "a".repeat(64), `unit-${++serial}`);
  const mapping = data.options.mappings[0];
  if (!mapping) throw new Error("missing-mapping");
  return { ...data, options: { ...data.options, mappings: [{ ...mapping, container: `unit_${serial}` }] } };
}
const moduleFactory = {
  factory: {
    async activate() {
      return { success: false, error: { code: "initialization-failed" } };
    },
  },
};

test("admission binds exact parsed definition, extension, host, artifact and independent operator/publisher/origin trust before evaluation", async () => {
  const data = setup();
  let evaluations = 0;
  const evaluate = async () => {
    evaluations++;
    return moduleFactory;
  };
  for (const change of [
    { trustedOperatorIds: [] },
    { trustedPublisherIds: [] },
    { trustedOrigins: [] },
    { limits: { ...data.options.limits, maximumBytes: 0 } },
    { limits: { ...data.options.limits, maximumMetadataCharacters: 1 } },
  ])
    expect((await loader({ ...data.options, ...change }, ["server"], evaluate).load(data.request)).success).toBe(false);
  const actual = loader(data.options, ["server"], evaluate);
  for (const request of [
    { ...data.request, extension: { ...data.request.extension, hostContractVersion: "other" } },
    { ...data.request, binding: { ...data.request.binding, artifactVersion: "other" } },
    { ...data.request, binding: { ...data.request.binding, extensionId: "other" } },
    { ...data.request, definition: { ...data.request.definition, identity: { ...data.request.definition.identity, definitionVersion: "other" } } },
  ])
    expect((await actual.load(request)).success).toBe(false);
  expect(evaluations).toBe(0);
});

test("unsupported executable fanout and missing single-script attestation are denied", async () => {
  const data = setup();
  const mapping = data.options.mappings[0];
  if (!mapping) throw new Error("missing-mapping");
  let calls = 0;
  const actual = loader({ ...data.options, mappings: [{ ...mapping, executableFiles: [mapping.binding.locator, "child.js"] }] }, ["server"], async () => {
    calls++;
    return moduleFactory;
  });
  expect(await actual.load(data.request)).toEqual({ success: false, error: { code: "denied" } });
  expect(calls).toBe(0);
});

test("concurrent exact loads share an immutable factory while one cancelled lease leaves others running", async () => {
  const data = setup();
  let finish: (value: unknown) => void = () => {};
  let calls = 0;
  let signal: AbortSignal | undefined;
  const actual = loader(data.options, ["server"], async (_mapping, _options, received) => {
    calls++;
    signal = received;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = cancelSource();
  const left = actual.load({ ...data.request, cancellation: first.cancellation });
  const right = actual.load(data.request);
  await Promise.resolve();
  first.cancel();
  expect(await left).toEqual({ success: false, error: { code: "cancelled" } });
  expect(signal?.aborted).toBe(false);
  finish(moduleFactory);
  const loaded = await right;
  const again = await actual.load(data.request);
  expect(loaded.success && again.success && loaded.data === again.data).toBe(true);
  expect(loaded.success && Object.isFrozen(loaded.data)).toBe(true);
  expect(calls).toBe(1);
  expect(first.count()).toBe(0);
});

test("last cancelled lease aborts owned work and uncooperative completion never publishes to caller", async () => {
  const data = setup();
  const cancel = cancelSource();
  let finish: (value: unknown) => void = () => {};
  let signal: AbortSignal | undefined;
  const actual = loader(data.options, ["server"], async (_mapping, _options, received) => {
    signal = received;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = actual.load({ ...data.request, cancellation: cancel.cancellation });
  await Promise.resolve();
  cancel.cancel();
  expect(await pending).toEqual({ success: false, error: { code: "cancelled" } });
  expect(signal?.aborted).toBe(true);
  finish(moduleFactory);
  expect(cancel.count()).toBe(0);
  expect((await actual.load(data.request)).success).toBe(false);
});

test("competing versions and same-name cross-origin aliases conflict before second execution, including failed partial evaluation", async () => {
  const data = setup();
  let calls = 0;
  const evaluate = async () => {
    calls++;
    throw new Error("PRIVATE_RAW_ERROR");
  };
  expect((await loader(data.options, ["server"], evaluate).load(data.request)).success).toBe(false);
  const mapping = data.options.mappings[0];
  if (!mapping) throw new Error("missing-mapping");
  const binding = { ...mapping.binding, artifactVersion: "2" };
  const second = loader({ ...data.options, mappings: [{ ...mapping, binding }] }, ["server"], evaluate);
  expect(await second.load({ ...data.request, binding })).toEqual({ success: false, error: { code: "denied" } });
  const other = setup();
  const otherMapping = other.options.mappings[0];
  if (!otherMapping) throw new Error("missing-mapping");
  const collision = loader({ ...other.options, mappings: [{ ...otherMapping, container: mapping.container }] }, ["server"], evaluate);
  expect(await collision.load(other.request)).toEqual({ success: false, error: { code: "denied" } });
  expect(calls).toBe(1);
});

test("wrong named exports fail after evaluation, never masquerading as zero-evaluation denial", async () => {
  const data = setup();
  let calls = 0;
  const actual = loader(data.options, ["server"], async () => {
    calls++;
    return { default: moduleFactory.factory };
  });
  expect(await actual.load(data.request)).toEqual({ success: false, error: { code: "invalid-factory" } });
  expect(calls).toBe(1);
});

test("noncooperative work times out to a bounded coded result without returning raw errors", async () => {
  const data = setup();
  const actual = loader({ ...data.options, limits: { ...data.options.limits, timeoutMilliseconds: 10 } }, ["server"], async () => new Promise(() => {}));
  expect(await actual.load(data.request)).toEqual({ success: false, error: { code: "load-failed" } });
});

test("binding/extension field order is irrelevant, options are detached, and server/CLI share the same physical factory", async () => {
  const data = setup();
  const mapping = data.options.mappings[0];
  if (!mapping) throw new Error("missing-mapping");
  const publishers = ["fixture-publisher"];
  const limits = { ...data.options.limits };
  const actual = loader(
    { ...data.options, trustedPublisherIds: publishers, limits, mappings: [mapping, { ...mapping, host: "cli" }] },
    ["server", "cli"],
    async () => moduleFactory,
  );
  publishers.length = 0;
  limits.maximumBytes = 0;
  const binding = data.request.binding;
  const reordered = {
    integrity: binding.integrity,
    loaderId: binding.loaderId,
    locator: binding.locator,
    artifactVersion: binding.artifactVersion,
    artifactKey: binding.artifactKey,
    extensionId: binding.extensionId,
  };
  const first = await actual.load({ ...data.request, binding: reordered });
  const second = await actual.load({ ...data.request, host: "cli" });
  expect(first.success && second.success && first.data === second.data).toBe(true);
});

test("diagnostics project bounded fixed codes before any sink, never raw plugin/network errors", async () => {
  const data = setup();
  const events: unknown[] = [];
  const actual = loader(
    {
      ...data.options,
      diagnostics: {
        write(event) {
          events.push(event);
        },
      },
    },
    ["server"],
    async () => {
      throw new Error("PRIVATE_URL_DOCUMENT_CONFIG_SENTINEL");
    },
  );
  expect(await actual.load(data.request)).toEqual({ success: false, error: { code: "load-failed" } });
  expect(events).toEqual([{ level: "warn", code: "load-failed" }]);
});

test("fatal UTF-8 and bounded actual chunked streams reject even without declared Content-Length", async () => {
  const invalid = new Uint8Array([0xff]);
  const digest = new Bun.CryptoHasher("sha256").update(invalid).digest("hex");
  let cancelled = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/utf8") return new Response(invalid);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024));
          },
          cancel() {
            cancelled++;
          },
        }),
      );
    },
  });
  try {
    await expect(checkedBytes(new URL("utf8", server.url).href, digest, 100, AbortSignal.timeout(1000))).rejects.toThrow();
    await expect(checkedBytes(new URL("stream", server.url).href, digest, 16, AbortSignal.timeout(1000))).rejects.toThrow("load-failed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cancelled).toBe(1);
  } finally {
    server.stop(true);
  }
});

test("actual bounded HTTP status/redirect/stream/hash checks precede evaluation and cancel oversized bodies", async () => {
  let redirected = 0;
  const bytes = new TextEncoder().encode("globalThis.checked = true;");
  const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/redirect") return new Response(null, { status: 302, headers: { location: "/target" } });
      if (path === "/target") redirected++;
      if (path === "/status") return new Response("PRIVATE_DOCUMENT", { status: 503 });
      return new Response(bytes);
    },
  });
  try {
    const signal = new AbortController().signal;
    expect(await checkedBytes(new URL("/valid", server.url).href, digest, 1000, signal)).toEqual(bytes);
    for (const path of ["/redirect", "/status"]) await expect(checkedBytes(new URL(path, server.url).href, digest, 1000, signal)).rejects.toThrow();
    await expect(checkedBytes(new URL("/valid", server.url).href, digest, 1, signal)).rejects.toThrow("load-failed");
    await expect(checkedBytes(new URL("/valid", server.url).href, "a".repeat(64), 1000, signal)).rejects.toThrow("integrity-mismatch");
    expect(redirected).toBe(0);
  } finally {
    server.stop(true);
  }
});
