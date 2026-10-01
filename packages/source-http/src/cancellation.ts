import type { Cancellation, Disposable } from "@pylons/contracts";

export class ReadCancellation implements Cancellation {
  private readonly listeners = new Set<() => void>();
  private stopped = false;
  get cancelled(): boolean {
    return this.stopped;
  }
  readonly onCancel = (listener: () => void): Disposable => {
    if (this.stopped) listener();
    else this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  cancel(): void {
    if (this.stopped) return;
    this.stopped = true;
    const listeners = [...this.listeners];
    this.listeners.clear();
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One foreign callback must not prevent transport abort or other cleanup.
      }
    }
  }
}

export function release(resource: Disposable | undefined): void {
  try {
    resource?.dispose();
  } catch {
    // Cleanup attempts are independent; no foreign error is exposed to callers.
  }
}
