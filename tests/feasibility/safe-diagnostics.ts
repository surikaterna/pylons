import type { DiagnosticSink } from "@pylons/contracts";
import { LoggerFactory } from "slf";

const codes = new Set([
  "source-unavailable",
  "plan-invalid",
  "admission-denied",
  "unsupported-kind",
  "load-failed",
  "activation-failed",
  "cleanup-failed",
  "restart-required",
]);
const logger = LoggerFactory.getLogger("pylons:diagnostic");

export const diagnostics: DiagnosticSink = {
  write(diagnostic) {
    if (!codes.has(diagnostic.code)) return;
    const correlation = diagnostic.correlation === "opaque-a" ? "opaque-a" : "redacted";
    const message = `diagnostic ${diagnostic.code} ${correlation}`;
    if (diagnostic.level === "debug") logger.debug(message);
    if (diagnostic.level === "info") logger.info(message);
    if (diagnostic.level === "warn") logger.warn(message);
    if (diagnostic.level === "error") logger.error(message);
  },
};
