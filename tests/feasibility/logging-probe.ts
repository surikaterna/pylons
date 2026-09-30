import { createRequire } from "node:module";
import debug from "debug";
import { Level, LoggerFactory } from "slf";
import { resolveDriver } from "./logging-bootstrap.js";
import { diagnostics } from "./safe-diagnostics.js";

const backendRequire = createRequire(import.meta.resolve("slf-debug"));
const queuedCount = () => globalThis.__slf._queued.length;
if (backendRequire("debug") !== debug) throw new Error("debug-instance-mismatch");
const lines: string[] = [];
const middleware: string[] = [];
LoggerFactory.use((event, next) => {
  middleware.push(JSON.stringify(event.params));
  next(null, event);
});
debug.log = (...args: unknown[]) => {
  lines.push(args.map(String).join(" "));
};
debug.enable("pylons:*");
LoggerFactory.setFactory(null);
diagnostics.write({ level: "error", code: "load-failed", correlation: "SECRET_CONFIG_DOCUMENT_HEADER_ERROR_SENTINEL" });
if (middleware.some((line) => line.includes("SENTINEL"))) throw new Error("premiddleware-redaction-failed");
if (JSON.stringify(globalThis.__slf._queued).includes("SENTINEL")) throw new Error("prequeue-redaction-failed");
LoggerFactory.setFactory(null);
const old = LoggerFactory.getLogger("pylons:probe");
for (let index = 0; index < 105; index++) old.info(`queued-${index}`);
if (queuedCount() !== 100) throw new Error("queue-capacity-changed");
if (globalThis.__slf._queued[0]?.[0]?.params[0] !== "queued-104") throw new Error("queue-overflow-changed");
LoggerFactory.setFactory(resolveDriver());
if (lines.length !== 100 || queuedCount() !== 0) throw new Error("queue-replay-failed");
old.info("old-logger-bound");
for (const level of ["debug", "info", "warn", "error"] satisfies readonly ("debug" | "info" | "warn" | "error")[]) old[level](`used-${level}`);
old.critical("critical-probe");
if (!lines.some((line) => line.includes("CRITITAL critical-probe"))) throw new Error("critical-quirk-changed");
const before = lines.length;
debug.disable();
old.info("disabled-backend");
if (lines.length !== before) throw new Error("namespace-disable-failed");
debug.enable("pylons:*");
globalThis.__slf._logLevel = Level.Warn;
const filtered = LoggerFactory.getLogger("pylons:threshold");
filtered.debug("filtered-debug");
filtered.info("filtered-info");
filtered.warn("retained-warn");
if (lines.some((line) => line.includes("filtered-"))) throw new Error("threshold-failed");
globalThis.__slf._logLevel = Level.Debug;
diagnostics.write({ level: "error", code: "load-failed", correlation: "SECRET_CONFIG_DOCUMENT_HEADER_ERROR_SENTINEL" });
if (lines.some((line) => line.includes("SENTINEL"))) throw new Error("redaction-failed");
const event = { name: "pylons:probe", timeStamp: 0, level: "info", params: ["single-arg-one"] } satisfies import("slf").Event;
resolveDriver()(event, { ...event, params: ["single-arg-two"] });
if (lines.some((line) => line.includes("single-arg-two"))) throw new Error("single-arg-quirk-changed");
LoggerFactory.setFactory(null);
old.info("queue-to-clear");
LoggerFactory.setFactory(null);
if (queuedCount() !== 0) throw new Error("queue-clear-failed");
console.log(
  JSON.stringify({
    debugVersion: backendRequire("debug/package.json").version,
    backendPath: backendRequire.resolve("debug"),
    queueCapacity: 100,
    overflowSlotZero: 104,
    usedLevels: ["debug", "info", "warn", "error"],
    critical: "CRITITAL",
    multiEventDriver: "first-only",
    lines: lines.length,
  }),
);
