import type { ArtifactLoader, Host, LifecycleEvent, Result } from "@pylons/contracts";
import { createRuntime, createVersionOwnership, type Runtime } from "@pylons/core";
import { authenticate, SecurityPolicy } from "./authority.js";
import type { Artifact } from "./definitions.js";
import { DemoError, document, object, reference, security, type Tenant, tenants, validation, validResult } from "./domain.js";
import { HostClock, Signal } from "./lifetime.js";
import { diagnostics, loggingReport } from "./logging.js";
import { metadataPorts } from "./source.js";
import type { RemoteEvent } from "./trace-contract.js";

export class DemoHost {
  readonly clock = new HostClock();
  readonly policy = new SecurityPolicy();
  private readonly ownership = createVersionOwnership();
  private readonly runtimes = new Map<Tenant, Runtime>();
  private readonly events: { host: Host; event: LifecycleEvent; at: number }[] = [];
  private readonly remote: (RemoteEvent & { readonly host: Host; readonly order: number; readonly at: number })[] = [];
  private closing = false;
  private readonly disposers: (() => void)[] = [];
  private rootsOwned = 0;
  private rootsCleaned = 0;
  private stopped: Promise<{ results: Result<undefined, { readonly code: "cleanup-failed" }>[]; report: ReturnType<DemoHost["report"]> }> | undefined;
  get closed(): boolean {
    return this.closing;
  }
  constructor(
    readonly host: Host,
    readonly origin: string,
    readonly loader: ArtifactLoader,
    readonly artifacts: readonly Artifact[],
  ) {
    Reflect.set(globalThis, "__pylonsDemoEvent", (value: RemoteEvent) => {
      const runtime = value.tenant === "a" || value.tenant === "b" ? this.runtimes.get(value.tenant) : undefined;
      const snapshot = runtime
        ?.snapshots()
        .find((entry) => entry.generation.definition.pluginId === value.plugin && entry.generation.generationId === value.generation);
      this.remote.push({
        ...value,
        desired: snapshot?.generation.desiredRevision ?? value.desired,
        applied: snapshot?.generation.appliedRevision ?? "none",
        host,
        order: this.remote.length,
        at: this.clock.now(),
      });
    });
    for (const scope of tenants) this.runtimes.set(scope, this.runtime(scope));
  }
  private runtime(scope: Tenant): Runtime {
    const ports = metadataPorts(this.origin, this.host, scope, this.clock);
    return createRuntime({
      context: ports.context,
      host: this.host,
      hostContractVersion: "1",
      source: ports.source,
      loader: this.loader,
      policy: {
        async evaluate(request) {
          const assigned =
            request.definition.identity.pluginId === "basic-validation" || (scope === "b" && request.definition.identity.pluginId === "reference-required");
          return assigned && request.context.scope.tenantId === scope && request.selection.enabled && request.binding?.loaderId === "loader-mf"
            ? { kind: "allow" }
            : { kind: "deny", code: "unauthorized" };
        },
      },
      authority: this.policy,
      clock: this.clock,
      observer: { observe: (event) => this.events.push({ host: this.host, event, at: this.clock.now() }) },
      diagnostics,
      bounds: { source: 1500, policy: 1000, load: 1500, activation: 1500, invocation: 1000, replacement: 1000, cleanup: 1000 },
      supportedContributionKinds: ["demo:validation"],
      securityStartupCapabilities: [security],
      versionOwnership: this.ownership,
      hostCapabilities: [
        {
          capability: security,
          isReady: () => this.policy.ready,
          provider: {
            async invoke() {
              return { success: true, data: null };
            },
          },
        },
      ],
    });
  }
  scoped(scope: Tenant): Runtime {
    const runtime = this.runtimes.get(scope);
    if (!runtime) throw new DemoError();
    return runtime;
  }
  own(dispose: () => void): void {
    this.rootsOwned++;
    if (this.closing) {
      dispose();
      this.rootsCleaned++;
    } else this.disposers.push(dispose);
  }
  async discover(scope: Tenant) {
    const runtime = this.scoped(scope);
    const result = await runtime.refresh();
    const catalog = metadataPorts(this.origin, this.host, scope, this.clock).catalog;
    const catalogResults = await Promise.all(runtime.metadata().map((entry) => catalog.read(entry, new Signal())));
    return { result, metadata: runtime.metadata(), catalog: catalogResults.map((entry) => entry.success) };
  }
  async validate(token: unknown, input: unknown, baseOnly = false) {
    const credential = authenticate(token);
    if (!credential || !document(input)) return { code: 2, error: "input-or-auth-failed" };
    if (!this.policy.ready || this.closing) return { code: 2, error: "security-not-ready" };
    const runtime = this.scoped(credential.tenant);
    const request = this.policy.request(credential);
    const capabilities = credential.tenant === "b" && !baseOnly ? [reference, validation] : [validation];
    for (const capability of capabilities) {
      if (!(await runtime.demand(capability, request.cancellation)).success) return { code: 2, error: "demand-failed" };
    }
    const results = await Promise.all(capabilities.map((capability) => runtime.invoke(capability, input, this.policy.request(credential))));
    if (results.some((result) => !result.success)) return { code: 2, error: "invocation-failed" };
    return { code: results.every((result) => result.success && validResult(result.data)) ? 0 : 1 };
  }
  async pair(scope: Tenant) {
    const runtime = this.scoped(scope);
    const first = new Signal();
    const second = new Signal();
    const pending = [runtime.demand(validation, first), runtime.demand(validation, second)];
    first.cancel();
    const results = await Promise.all(pending);
    return { results, subscriptions: first.pending + second.pending };
  }
  report() {
    return {
      host: this.host,
      closing: this.closing,
      security: this.policy.ready,
      timers: this.clock.pending,
      rootsOwned: this.rootsOwned,
      rootsCleaned: this.rootsCleaned,
      snapshots: Object.fromEntries(tenants.map((scope) => [scope, this.scoped(scope).snapshots()])),
      events: [...this.events],
      remote: [...this.remote],
      logging: loggingReport(),
    };
  }
  shutdown() {
    this.stopped ??= this.stop();
    return this.stopped;
  }
  private async stop() {
    this.closing = true;
    this.policy.initialize(false);
    const pending = tenants.map((scope) => this.scoped(scope).shutdown());
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {
        diagnostics.write({ level: "error", code: "cleanup-failed" });
      }
      this.rootsCleaned++;
    }
    const results = await Promise.all(pending);
    return { results, report: this.report() };
  }
  async command(value: unknown): Promise<unknown> {
    if (!object(value)) return { error: "input-failed" };
    if (this.closing && value.op !== "report" && value.op !== "shutdown" && value.op !== "exit") return { error: "closed" };
    const scope = value.tenant === "b" ? "b" : "a";
    if (value.op === "discover") return this.discover(scope);
    if (value.op === "refresh") return this.scoped(scope).refresh();
    if (value.op === "security") {
      this.policy.initialize(value.ready === true);
      return this.scoped(scope).startup();
    }
    if (value.op === "pair") return this.pair(scope);
    if (value.op === "validate") return this.validate(value.token, value.document, value.baseOnly === true);
    if (value.op === "invoke") {
      const credential = authenticate(value.token);
      if (!credential || !document(value.document)) return { error: "auth-failed" };
      return this.scoped(scope).invoke(validation, value.document, this.policy.request(credential));
    }
    if (value.op === "shutdown") return this.shutdown();
    return this.report();
  }
}
