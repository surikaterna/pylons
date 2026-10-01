import { object } from "./factory-guard.js";
import { LoadError } from "./transport.js";
import type { Flight } from "./version-policy.js";

interface State {
  readonly plugins: Map<string, string>;
  readonly artifacts: Map<string, string>;
  readonly containers: Map<string, string>;
  readonly flights: Map<string, Flight>;
}

function stringMap(value: unknown): value is Map<string, string> {
  return value instanceof Map && [...value].every(([key, entry]) => typeof key === "string" && typeof entry === "string");
}

function flightValue(value: unknown): value is Flight {
  return (
    object(value) &&
    value.controller instanceof AbortController &&
    value.promise instanceof Promise &&
    typeof value.leases === "number" &&
    typeof value.settled === "boolean"
  );
}

function flightMap(value: unknown): value is Map<string, Flight> {
  return value instanceof Map && [...value].every(([key, entry]) => typeof key === "string" && flightValue(entry));
}

function state(value: unknown): value is State {
  return object(value) && stringMap(value.plugins) && stringMap(value.artifacts) && stringMap(value.containers) && flightMap(value.flights);
}

// All copies in one realm share reservations, never mutable tenant activation instances.
export function realmState(): State {
  const key = Symbol.for("@pylons/loader-mf/realm-reservations/v1");
  const existing: unknown = Reflect.get(globalThis, key);
  if (existing !== undefined) {
    if (!state(existing)) throw new LoadError("load-failed");
    return existing;
  }
  const created: State = Object.freeze({ plugins: new Map(), artifacts: new Map(), containers: new Map(), flights: new Map() });
  Object.defineProperty(globalThis, key, { value: created });
  return created;
}
