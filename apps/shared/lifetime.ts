import type { Cancellation, Clock } from "@pylons/contracts";

export class Signal implements Cancellation {
  cancelled = false;
  private readonly listeners = new Set<() => void>();
  get pending(): number {
    return this.listeners.size;
  }
  onCancel(callback: () => void) {
    if (this.cancelled) callback();
    else this.listeners.add(callback);
    return {
      dispose: () => {
        this.listeners.delete(callback);
      },
    };
  }
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const callback of [...this.listeners]) callback();
    this.listeners.clear();
  }
}

export class HostClock implements Clock {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  now(): number {
    return performance.timeOrigin + performance.now();
  }
  get pending(): number {
    return this.timers.size;
  }
  schedule(delay: number, callback: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return {
      dispose: () => {
        clearTimeout(timer);
        this.timers.delete(timer);
      },
    };
  }
}
