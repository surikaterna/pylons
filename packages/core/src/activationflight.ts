import type { Cancellation, Disposable, Result } from "@pylons/contracts";
import { CancellationSource } from "./cancellation.js";
import type { CoreFailure } from "./types.js";

type Outcome = Result<undefined, CoreFailure>;

export class ActivationFlight {
  readonly cancellation = new CancellationSource();
  private leases = 0;
  private startup = false;
  private settled = false;
  private readonly result: Promise<Outcome>;

  constructor(
    work: (cancellation: Cancellation) => Promise<Outcome>,
    private readonly abandoned: () => void,
  ) {
    this.result = Promise.resolve()
      .then(() => work(this.cancellation))
      .then(
        (result) => {
          this.settled = true;
          if (!result.success) this.cancellation.cancel();
          return result;
        },
        () => {
          this.settled = true;
          this.cancellation.dispose();
          return { success: false, error: { code: "unavailable" } };
        },
      );
  }

  join(caller: Cancellation, startup = false): Promise<Outcome> {
    if (caller.cancelled) return Promise.resolve({ success: false, error: { code: "cancelled" } });
    this.startup ||= startup;
    this.leases++;
    return new Promise((resolve) => {
      let finished = false;
      let subscription: Disposable | undefined;
      const finish = (outcome: Outcome): void => {
        if (finished) return;
        finished = true;
        subscription?.dispose();
        this.leases--;
        resolve(outcome);
        if (!this.settled && this.leases === 0 && !this.startup) this.close();
      };
      subscription = caller.onCancel(() => finish({ success: false, error: { code: "cancelled" } }));
      if (finished) subscription.dispose();
      this.result.then(finish);
    });
  }

  close(): void {
    if (this.cancellation.cancelled) return;
    this.cancellation.cancel();
    this.abandoned();
  }
}
