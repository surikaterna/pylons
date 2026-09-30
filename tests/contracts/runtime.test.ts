import { expect, test } from "bun:test";
import type {
  ActivationContext,
  AdmissionPolicy,
  ConfigReplacement,
  Host,
  InvocationContext,
  JsonValue,
  PluginFactory,
  Result,
} from "../../packages/contracts/src/index.js";
import { parseConfigSideband } from "../../packages/contracts/src/index.js";
import {
  cancellationFake,
  catalogFake,
  clockFake,
  eventFake,
  factoryFake,
  loaderFake,
  neverCancelled,
  observationFake,
  ownershipFake,
  registrarFake,
  sourceFake,
} from "../../packages/contracts/test/fakes.js";
import { binding, config, definition, extension, inventory, scope } from "../../packages/contracts/test/fixtures.js";

test("metadata catalog/source and declaration-only admission execute neither loader nor factory", async () => {
  const contexts: ActivationContext[] = [];
  const loads: string[] = [];
  const factory = factoryFake(contexts);
  const loader = loaderFake(factory, loads);
  const catalog = await catalogFake().read(definition().identity, neverCancelled);
  const source = await sourceFake().read({ scope, authorizationId: "verified" }, neverCancelled);
  const policy: AdmissionPolicy = {
    async evaluate() {
      return { kind: "allow" };
    },
  };
  const selection = inventory().installations[0];
  if (!selection || !catalog.success || !source.success) throw new Error("fixture failure");
  expect(
    await policy.evaluate({
      context: { scope, authorizationId: "verified" },
      selection,
      definition: catalog.data,
      host: "server",
      validity: source.data.inventory.validity,
    }),
  ).toEqual({ kind: "allow" });
  expect(catalog.data.extensions.length).toBe(0);
  expect(source.data.definitions[0]?.contributions[0]?.kind).toBe("example:validation");
  expect(loads).toEqual([]);
  expect(contexts).toEqual([]);
  expect(typeof loader.load).toBe("function");
});

function activation(tenantId: string, generationId: string, minimum: number, host: Host = "server") {
  const configuration = parseConfigSideband({ ...config(tenantId), values: { minimum } });
  if (!configuration.success) throw new Error("invalid config fixture");
  const registrar = registrarFake();
  const resources = ownershipFake();
  const context: ActivationContext = {
    generation: { scope: { hostId: "host", tenantId }, definition: config().definition, generationId, desiredRevision: "revision-a" },
    host,
    configuration: configuration.data,
    cancellation: neverCancelled,
    providers: registrar.port,
    resources: resources.port,
  };
  return { context, registrar, resources };
}
function request(subjectId: string): InvocationContext {
  return {
    principal: { subjectId },
    credential: { reference: `${subjectId}-credential` },
    transaction: { id: `${subjectId}-transaction` },
    cancellation: neverCancelled,
    hostContext: { opaque: true },
  };
}

function expectedInvocation(subject: string, tenant: string, generation: string, minimum: number): Result<JsonValue, never> {
  return {
    success: true,
    data: { input: null, config: { minimum }, tenant, generation, subject, credential: `${subject}-credential`, transaction: `${subject}-transaction` },
  };
}

test.each<Host>([
  "server",
  "browser",
  "cli",
])("%s author seam: one reusable factory creates two independent scoped activations with immutable config and request-local identity", async (host) => {
  const contexts: ActivationContext[] = [];
  const loads: string[] = [];
  const loaded = await loaderFake(factoryFake(contexts), loads).load({
    definition: definition(true),
    extension,
    host,
    binding,
    cancellation: neverCancelled,
  });
  if (!loaded.success) throw new Error("fixture load");
  const left = activation("tenant-a", "generation-a", 3, host);
  const right = activation("tenant-b", "generation-b", 8, host);
  const [a, b] = await Promise.all([loaded.data.activate(left.context), loaded.data.activate(right.context)]);
  expect(a.success && b.success).toBe(true);
  const providerA = left.registrar.providers.get("validation");
  const providerB = right.registrar.providers.get("validation");
  if (!providerA || !providerB) throw new Error("fixture registration");
  const outputs = await Promise.all([
    providerA.invoke(null, request("alice")),
    providerB.invoke(null, request("bob")),
    providerA.invoke(null, request("carol")),
  ]);
  expect(outputs).toEqual([
    expectedInvocation("alice", "tenant-a", "generation-a", 3),
    expectedInvocation("bob", "tenant-b", "generation-b", 8),
    expectedInvocation("carol", "tenant-a", "generation-a", 3),
  ]);
  expect(loads.length).toBe(1);
  expect(contexts.length).toBe(2);
  expect(Object.isFrozen(left.context.configuration.values)).toBe(true);
  if (a.success) expect(await a.data.cleanup()).toEqual({ success: true, data: undefined });
  expect(left.registrar.providers.size).toBe(0);
  expect(right.registrar.providers.size).toBe(1);
  if (b.success) await b.data.cleanup();
});

test("partial initialization hands async cleanup ownership to host without implementing a coordinator", async () => {
  const fixture = activation("tenant-a", "partial", 3);
  let cleaned = false;
  const factory: PluginFactory = {
    async activate(context) {
      context.resources.own({
        async cleanup() {
          cleaned = true;
          return { success: true, data: undefined };
        },
      });
      return { success: false, error: { code: "initialization-failed" } };
    },
  };
  expect(await factory.activate(fixture.context)).toEqual({ success: false, error: { code: "initialization-failed" } });
  expect(cleaned).toBe(false);
  expect(fixture.resources.acquired.length).toBe(1);
  for (const resource of fixture.resources.acquired) expect(await resource.cleanup()).toEqual({ success: true, data: undefined });
  expect(cleaned).toBe(true);
});

test("source/catalog/load/cancel/registration/policy seams carry operation-specific outcomes", async () => {
  const cancellation = cancellationFake();
  cancellation.cancel();
  expect(await sourceFake().read({ scope, authorizationId: "verified" }, cancellation.cancellation)).toEqual({ success: false, error: { code: "cancelled" } });
  expect(await catalogFake().read({ pluginId: "missing", definitionVersion: "1" }, neverCancelled)).toEqual({ success: false, error: { code: "not-found" } });
  expect(
    await loaderFake(factoryFake([]), []).load({ definition: definition(true), extension, host: "cli", binding, cancellation: cancellation.cancellation }),
  ).toEqual({ success: false, error: { code: "cancelled" } });
  const registrar = registrarFake();
  const provider = {
    async invoke() {
      return { success: true, data: null };
    },
  } satisfies import("../../packages/contracts/src/index.js").Provider;
  registrar.port.register({ capabilityId: "c", contractVersion: "1" }, provider);
  expect(registrar.port.register({ capabilityId: "c", contractVersion: "1" }, provider)).toEqual({ success: false, error: { code: "duplicate-provider" } });
  const denied: AdmissionPolicy = {
    async evaluate() {
      return { kind: "deny", code: "untrusted" };
    },
  };
  const selection = inventory(true).installations[0];
  if (!selection) throw new Error("fixture");
  expect(
    await denied.evaluate({
      context: { scope, authorizationId: "verified" },
      selection,
      definition: definition(true),
      host: "cli",
      extension,
      binding,
      validity: inventory().validity,
    }),
  ).toEqual({ kind: "deny", code: "untrusted" });
});

test("neutral cancellation subscription/disposable, controlled clock and typed observation seams", () => {
  const cancellation = cancellationFake();
  let calls = 0;
  const subscription = cancellation.cancellation.onCancel(() => {
    calls++;
  });
  subscription.dispose();
  cancellation.cancel();
  cancellation.cancel();
  expect(calls).toBe(0);
  expect(cancellation.cancellation.cancelled).toBe(true);
  const event = eventFake<number>();
  const listener = event.event((value) => {
    calls += value;
  });
  event.fire(2);
  listener.dispose();
  event.fire(10);
  expect(calls).toBe(2);
  expect(event.size()).toBe(0);
  const clock = clockFake();
  let ticks = 0;
  clock.port.schedule(10, () => {
    ticks++;
  });
  const timer = clock.port.schedule(5, () => {
    ticks++;
  });
  timer.dispose();
  clock.advance(10);
  expect(clock.port.now()).toBe(10);
  expect(ticks).toBe(1);
  const observation = observationFake();
  observation.observer.observe({
    kind: "state-changed",
    snapshot: { state: "declaration-only", generation: activation("tenant-a", "data", 3).context.generation },
  });
  observation.sink.write({ level: "warn", code: "restart-required", correlation: "opaque-id" });
  expect(observation.events[0]?.kind).toBe("state-changed");
  expect(observation.diagnostics).toEqual([{ level: "warn", code: "restart-required", correlation: "opaque-id" }]);
});

test.each<ConfigReplacement>([
  { kind: "applied", appliedRevision: "revision-b" },
  { kind: "restart-required" },
  { kind: "failed", code: "replacement-failed" },
])("configuration replacement is explicit, never silently advances provenance: %p", async (outcome) => {
  const instance = {
    async cleanup() {
      return { success: true, data: undefined };
    },
    async replaceConfiguration() {
      return outcome;
    },
  } satisfies import("../../packages/contracts/src/index.js").ActivatedInstance;
  expect(await instance.replaceConfiguration()).toEqual(outcome);
});
