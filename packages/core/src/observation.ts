import type { Diagnostic, LifecycleEvent, RuntimeSnapshot } from "@pylons/contracts";
import { createEventEmitter } from "./eventemitter.js";
import type { RuntimeOptions } from "./types.js";

export function createObservation(options: RuntimeOptions) {
  const emitter = createEventEmitter<RuntimeSnapshot>();
  return {
    event: emitter.event,
    emit(event: LifecycleEvent): void {
      try {
        options.observer.observe(event);
      } catch {
        /* Observer failures are isolated. */
      }
      if (event.kind === "state-changed") emitter.fire(event.snapshot);
    },
    diagnose(code: Diagnostic["code"]): void {
      try {
        options.diagnostics.write({ level: "warn", code });
      } catch {
        /* Diagnostics are not authority. */
      }
    },
    dispose: () => emitter.dispose(),
  };
}

export type Observation = ReturnType<typeof createObservation>;
