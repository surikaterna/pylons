import type { DemoHost } from "../shared/host.js";

export class ViewRequests {
  private pending: AbortController | undefined;
  constructor(private readonly host: DemoHost) {
    host.own(() => this.close());
  }
  start(): AbortController {
    const previous = this.pending;
    const request = new AbortController();
    this.pending = request;
    previous?.abort();
    return request;
  }
  current(request: AbortController): boolean {
    return !this.host.closed && this.pending === request && !request.signal.aborted;
  }
  finish(request: AbortController): void {
    if (this.pending === request) this.pending = undefined;
  }
  private close(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.abort();
  }
}
