import type { Disposable, Result } from "@pylons/contracts";
import { parseResolvedPlan } from "@pylons/contracts";
import { bounded } from "./boundary.js";
import { CancellationSource } from "./cancellation.js";
import type { Coordinator } from "./coordinator.js";
import type { Observation } from "./observation.js";
import { selectPlan } from "./selection.js";
import type { CoreFailure, RuntimeOptions } from "./types.js";
import { expiry, validPlan } from "./validity.js";

type Outcome = Result<undefined, CoreFailure>;

export class RefreshController {
  private requested = 0;
  private running: Promise<Outcome> | undefined;
  private readonly cancellation = new CancellationSource();
  private timer: Disposable | undefined;
  private readonly hint: Disposable | undefined;

  constructor(
    private readonly options: RuntimeOptions,
    private readonly coordinator: Coordinator,
    private readonly observation: Observation,
  ) {
    this.hint = options.source.onInvalidation?.((hint) => {
      if (hint.scope.hostId === options.context.scope.hostId && hint.scope.tenantId === options.context.scope.tenantId) void this.refresh();
    });
  }

  refresh(): Promise<Outcome> {
    if (this.coordinator.closed) return Promise.resolve({ success: false, error: { code: "closed" } });
    this.requested++;
    this.running ??= this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async drain(): Promise<Outcome> {
    let token = this.requested;
    let result = await this.read(token);
    while (!this.coordinator.closed && token !== this.requested) {
      token = this.requested;
      result = await this.read(token);
    }
    return result;
  }

  private async read(token: number): Promise<Outcome> {
    const read = await bounded(
      () => this.options.source.read(this.options.context, this.cancellation),
      this.options.clock,
      this.options.bounds.source,
      this.cancellation,
    );
    if (this.coordinator.closed) return { success: false, error: { code: "closed" } };
    if (read.kind === "value" && !read.value.success && read.value.error.code === "unauthorized") this.coordinator.revoke();
    if (token !== this.requested) return { success: false, error: { code: "cancelled" } };
    if (read.kind !== "value" || !read.value.success) {
      this.observation.diagnose("source-unavailable");
      return { success: false, error: { code: read.kind === "timeout" ? "timeout" : "unavailable" } };
    }
    const candidate = parseResolvedPlan(read.value.data);
    if (!candidate.success || !validPlan(candidate.data, this.options.context, this.options.clock.now())) {
      this.observation.diagnose("plan-invalid");
      return { success: false, error: { code: "invalid-plan" } };
    }
    const selections = await selectPlan(candidate.data, this.options, this.observation, this.cancellation);
    if (token !== this.requested || this.coordinator.closed || !validPlan(candidate.data, this.options.context, this.options.clock.now()))
      return { success: false, error: { code: "cancelled" } };
    this.timer?.dispose();
    this.timer = this.options.clock.schedule(Math.max(0, expiry(candidate.data) - this.options.clock.now()), () => this.coordinator.expire());
    await this.coordinator.apply(
      candidate.data,
      selections,
      () => token === this.requested && !this.coordinator.closed && validPlan(candidate.data, this.options.context, this.options.clock.now()),
    );
    if (this.coordinator.closed) return { success: false, error: { code: "closed" } };
    return { success: true, data: undefined };
  }

  close(): void {
    this.cancellation.cancel();
    this.hint?.dispose();
    this.timer?.dispose();
  }
}
