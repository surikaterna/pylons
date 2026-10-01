import type { Clock, Disposable } from "@pylons/contracts";
import type { Boundary } from "./boundary.js";
import type { CancellationSource } from "./cancellation.js";

export function invocationOperation<T>(work: () => Promise<T>, clock: Clock, duration: number, cancellation: CancellationSource): Promise<Boundary<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: Disposable | undefined;
    let subscription: Disposable | undefined;
    const finish = (result: Boundary<T>): void => {
      if (settled) return;
      // Latch the outcome before cooperative cancellation can synchronously reenter this boundary.
      settled = true;
      timer?.dispose();
      subscription?.dispose();
      if (result.kind === "timeout") cancellation.cancel();
      resolve(result);
    };
    if (cancellation.cancelled) {
      finish({ kind: "cancelled" });
      return;
    }
    timer = clock.schedule(duration, () => finish({ kind: "timeout" }));
    subscription = cancellation.onCancel(() => finish({ kind: "cancelled" }));
    if (settled) {
      timer.dispose();
      subscription.dispose();
      return;
    }
    try {
      work().then(
        (value) => finish({ kind: "value", value }),
        () => finish({ kind: "failed" }),
      );
    } catch {
      finish({ kind: "failed" });
    }
  });
}
