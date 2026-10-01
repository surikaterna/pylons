import { expect, test } from "bun:test";
import type { RuntimeSnapshot } from "@pylons/contracts";
import { eventLine, safeEvent, safeId, safeSnapshot } from "../../apps/shared/diagnostic-view.js";
import { object } from "../../apps/shared/domain.js";
import { DemoHost } from "../../apps/shared/host.js";
import { HostClock, Signal } from "../../apps/shared/lifetime.js";
import { observedPorts, type SourceOutcome, sourceGuidance } from "../../apps/shared/source-outcomes.js";

const snapshot: RuntimeSnapshot = {
  generation: {
    scope: { hostId: "cli-demo", tenantId: "a" },
    definition: { pluginId: "evil\u001b[31m\nplugin", definitionVersion: "1" },
    generationId: "g2",
    desiredRevision: "r1",
  },
  state: "failed",
  failureCode: "expired",
};

test("safe projection strips terminal escapes, bounds IDs and omits extra payloads", () => {
  const value = { ...snapshot, configuration: "SECRET_CONFIG_SENTINEL", message: "SECRET_ERROR_SENTINEL" };
  const projected = safeSnapshot(value);
  expect(JSON.stringify(projected)).not.toContain("SENTINEL");
  expect([...projected.generation.definition.pluginId].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)).toBe(true);
  expect(safeId("x".repeat(200))).toHaveLength(96);
  expect(projected.failureCode).toBe("expired");
  expect(projected.generation.appliedRevision).toBeUndefined();
  const entry = { at: 1000, event: safeEvent({ kind: "state-changed", snapshot: value }) };
  expect(eventLine(entry)).toContain("1970-01-01T00:00:01.000Z");
  expect(eventLine(entry)).toContain("failed / expired");
  expect(eventLine(entry)).not.toContain("SENTINEL");
});

test("provider changes retain actual readiness and identity, not an inferred instance state", () => {
  const event = safeEvent({
    kind: "provider-changed",
    generation: snapshot.generation,
    capability: { capabilityId: "validation", contractVersion: "1" },
    ready: false,
  });
  expect(event.kind).toBe("provider-changed");
  expect(eventLine({ at: 0, event })).toContain("ready=false");
});

test("source wrapper preserves typed operations, result identity and actual completion timestamps", async () => {
  const outcomes: SourceOutcome[] = [];
  const plan = { success: false, error: { code: "invalid-plan" } } satisfies Awaited<ReturnType<import("@pylons/contracts").PlanSource["read"]>>;
  const catalog = { success: false, error: { code: "invalid-definition" } } satisfies Awaited<
    ReturnType<import("@pylons/contracts").DefinitionCatalog["read"]>
  >;
  const clock = new HostClock();
  const ports = observedPorts(
    {
      source: {
        async read() {
          return plan;
        },
      },
      catalog: {
        async read() {
          return catalog;
        },
      },
    },
    "b",
    clock,
    (value) => outcomes.push(value),
  );
  const before = clock.now();
  expect(await ports.source.read({ scope: { hostId: "cli-demo", tenantId: "b" }, authorizationId: "demo-b" }, new Signal())).toBe(plan);
  expect(await ports.catalog.read(snapshot.generation.definition, new Signal())).toBe(catalog);
  expect(outcomes.map((entry) => [entry.operation, entry.code, entry.scope])).toEqual([
    ["plan", "invalid-plan", "b"],
    ["catalog", "invalid-definition", "b"],
  ]);
  expect(outcomes.every((entry) => entry.at >= before && entry.at <= clock.now())).toBe(true);
  expect(new Set(outcomes.map((entry) => entry.operationId)).size).toBe(2);
  expect(sourceGuidance("invalid-plan")).toContain("Invalid or expired");
  expect(sourceGuidance("invalid-plan")).not.toContain("Metadata expired.");
  for (const code of ["ok", "cancelled", "not-found", "unavailable", "unauthorized", "invalid-definition"] satisfies SourceOutcome["code"][])
    expect(sourceGuidance(code)).not.toBe("");
});

test("explicit logging privacy probe is redacted before queues, middleware and backend", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      'import {loggingPrivacyProbe,bindLogging,loggingReport} from "./apps/shared/logging.ts"; loggingPrivacyProbe(); bindLogging(); loggingPrivacyProbe(); console.log(JSON.stringify(loggingReport()));',
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(exit).toBe(0);
  expect(stdout + stderr).not.toContain("SENTINEL");
  expect(stdout).toContain("plan-invalid c0");
  expect(stdout).toContain("queued");
  expect(stderr).toContain("plan-invalid c0");
  const report: unknown = JSON.parse(stdout);
  if (!object(report)) throw new Error("logging-report-missing");
  for (const key of ["queued", "middleware", "backend"]) {
    expect(JSON.stringify(report[key])).toContain("plan-invalid c0");
    expect(JSON.stringify(report[key])).not.toContain("SENTINEL");
  }
});

test("private observers are isolated, owned and never called after host closure", async () => {
  const host = new DemoHost(
    "cli",
    "http://127.0.0.1/",
    {
      async load() {
        return { success: false, error: { code: "load-failed" } };
      },
    },
    [],
  );
  let called = 0;
  const throwing = host.onDiagnostics(() => {
    throw new Error("SECRET_ERROR_SENTINEL");
  });
  const counting = host.onDiagnostics(() => {
    called++;
  });
  host.own(() => throwing.dispose());
  host.own(() => counting.dispose());
  expect(() => host.initializeSecurity(true)).not.toThrow();
  expect(host.policy.ready).toBe(true);
  expect(called).toBe(1);
  await host.shutdown();
  expect(await host.command({ op: "diagnostics" })).toMatchObject({ closing: true, plugins: [] });
  host.initializeSecurity(false);
  expect(called).toBe(1);
  expect(host.report().rootsOwned).toBe(host.report().rootsCleaned);
});
