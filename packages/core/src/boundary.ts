import type { Cancellation, Clock, Disposable } from "@pylons/contracts";

export type Boundary<T> = { readonly kind: "value"; readonly value: T } | { readonly kind: "cancelled" | "timeout" | "failed" };

export function bounded<T>(work: () => Promise<T>, clock: Clock, duration: number, cancellation?: Cancellation): Promise<Boundary<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: Disposable | undefined;
    let subscription: Disposable | undefined;
    const finish = (result: Boundary<T>): void => {
      if (settled) return;
      settled = true;
      timer?.dispose();
      subscription?.dispose();
      resolve(result);
    };
    if (cancellation?.cancelled) {
      finish({ kind: "cancelled" });
      return;
    }
    timer = clock.schedule(duration, () => finish({ kind: "timeout" }));
    subscription = cancellation?.onCancel(() => finish({ kind: "cancelled" }));
    if (settled) {
      timer.dispose();
      subscription?.dispose();
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
