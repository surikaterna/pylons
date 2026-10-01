import type { Event } from "@pylons/contracts";

export function createEventEmitter<T>() {
  const listeners = new Set<(value: T) => void>();
  let closed = false;
  const event: Event<T> = (listener) => {
    if (!closed) listeners.add(listener);
    return {
      dispose: () => {
        listeners.delete(listener);
      },
    };
  };
  return {
    event,
    fire(value: T): void {
      if (closed) return;
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch {
          /* Observation cannot change lifecycle correctness. */
        }
      }
    },
    dispose(): void {
      closed = true;
      listeners.clear();
    },
  };
}
