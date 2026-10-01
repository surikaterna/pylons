import type { Cancellation, Disposable } from "@pylons/contracts";
import { createEventEmitter } from "./eventemitter.js";

export class CancellationSource implements Cancellation {
  private readonly emitter = createEventEmitter<void>();
  private cancelledState = false;
  private readonly subscriptions: Disposable[] = [];
  readonly onCancel = this.emitter.event;
  get cancelled(): boolean {
    return this.cancelledState;
  }

  constructor(parents: readonly Cancellation[] = []) {
    for (const parent of parents) {
      if (this.cancelledState) break;
      if (parent.cancelled) this.cancel();
      else {
        const subscription = parent.onCancel(() => this.cancel());
        if (this.cancelledState) subscription.dispose();
        else this.subscriptions.push(subscription);
      }
    }
  }

  cancel(): void {
    if (this.cancelledState) return;
    this.cancelledState = true;
    this.emitter.fire();
    this.dispose();
  }

  dispose(): void {
    for (const subscription of this.subscriptions.splice(0)) subscription.dispose();
    this.emitter.dispose();
  }
}
