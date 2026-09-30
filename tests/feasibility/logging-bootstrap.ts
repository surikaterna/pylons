import { type Event, LoggerFactory } from "slf";
import slfDebug from "slf-debug";
import { isObject } from "./artifact-index.js";

let bound = false;
const logger = LoggerFactory.getLogger("pylons:host");
logger.debug("host queued before bootstrap");
export function bindLogging(): void {
  if (bound) throw new Error("duplicate-logger-bootstrap");
  bound = true;
  LoggerFactory.setFactory(resolveDriver());
  logger.info("host logger bound");
  logger.warn("host warning characterization");
  logger.error("host error characterization");
}

function isDriver(value: unknown): value is (...events: Event[]) => void {
  return typeof value === "function";
}

export function resolveDriver(): (...events: Event[]) => void {
  const imported: unknown = slfDebug;
  const driver = isObject(imported) ? imported.default : imported;
  if (!isDriver(driver)) throw new Error("logger-driver-incompatible");
  return driver;
}
