import type { Cancellation } from "@pylons/contracts";
import type { Flight, Loaded } from "./version-policy.js";

export function lease(shared: Flight, cancellation: Cancellation): Promise<Loaded> {
  shared.leases++;
  return new Promise((resolve) => {
    let done = false;
    let subscription: { dispose(): void } | undefined;
    const finish = (result: Loaded) => {
      if (done) return;
      done = true;
      try {
        subscription?.dispose();
      } catch {
        /* A hostile host subscription cannot strand other leases. */
      }
      shared.leases--;
      if (!shared.settled && shared.leases === 0) shared.controller.abort();
      resolve(result);
    };
    const cancelled = () => finish({ success: false, error: { code: "cancelled" } });
    try {
      subscription = cancellation.onCancel(cancelled);
      if (done) subscription.dispose();
      if (cancellation.cancelled) cancelled();
      void shared.promise.then(
        (result) => (cancellation.cancelled ? cancelled() : finish(result)),
        () => finish({ success: false, error: { code: "load-failed" } }),
      );
    } catch {
      cancelled();
    }
  });
}
