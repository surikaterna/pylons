import type { Diagnostic, DiagnosticSink } from "@pylons/contracts";
import debug from "debug";
import { type Event, LoggerFactory } from "slf";
import slfDebug from "slf-debug";
import { DemoError, object } from "./domain.js";

const safeCodes = new Set([
  "source-unavailable",
  "plan-invalid",
  "admission-denied",
  "unsupported-kind",
  "load-failed",
  "activation-failed",
  "cleanup-failed",
  "restart-required",
]);
let bound = false;
const capture: { middleware: string[]; queued: string; backend: string[] } = { middleware: [], queued: "", backend: [] };
function driver(value: unknown): value is (...events: Event[]) => void {
  return typeof value === "function";
}
export const diagnostics: DiagnosticSink = {
  write(value: Diagnostic) {
    const code = safeCodes.has(value.code) ? value.code : "plan-invalid";
    const correlation = value.correlation && /^c[0-9]{1,10}$/.test(value.correlation) ? value.correlation : "c0";
    LoggerFactory.getLogger("pylons:demo-host")[value.level](`demo ${code} ${correlation}`);
  },
};
export function bindLogging(): void {
  if (bound) throw new DemoError();
  bound = true;
  LoggerFactory.use((event, next) => {
    capture.middleware.push(JSON.stringify(event.params));
    next(null, event);
  });
  LoggerFactory.getLogger("pylons:demo-host").debug("demo bootstrap");
  diagnostics.write({ level: "warn", code: "plan-invalid", correlation: "SECRET_CONFIG_DOCUMENT_HEADER_ERROR_SENTINEL" });
  capture.queued = JSON.stringify(globalThis.__slf._queued);
  const imported: unknown = slfDebug;
  const actual = object(imported) ? imported.default : imported;
  if (!driver(actual)) throw new DemoError();
  const original = debug.log;
  debug.log = (...args: unknown[]) => {
    capture.backend.push(args.map(String).join(" "));
    original(...args);
  };
  debug.enable("pylons:*");
  LoggerFactory.setFactory(actual);
}
export function loggingReport() {
  return { ...capture, middleware: [...capture.middleware], backend: [...capture.backend] };
}
