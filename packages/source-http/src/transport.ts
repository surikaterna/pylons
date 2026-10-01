import type { Cancellation, Disposable, ResolvedPlan, Result } from "@pylons/contracts";
import { ReadCancellation, release } from "./cancellation.js";
import type { HttpSourceOptions, MetadataRequest } from "./types.js";
import { failure, type ReadFailure, validatePlan, validGrant, validOptions, withinBytes } from "./validation.js";

export class MetadataReader {
  private readonly active = new Map<string, ReadCancellation>();
  constructor(private readonly options: HttpSourceOptions) {}

  async read(request: MetadataRequest, cancellation: Cancellation): Promise<Result<ResolvedPlan, ReadFailure>> {
    const own = new ReadCancellation();
    let subscription: Disposable | undefined;
    let timer: Disposable | undefined;
    let key: string | undefined;
    try {
      request = snapshotRequest(request);
      if (!validOptions(this.options) || cancellation.cancelled) return failure(cancellation.cancelled ? "cancelled" : "unavailable");
      key = JSON.stringify([
        request.context.scope.hostId,
        request.context.scope.tenantId,
        request.context.authorizationId,
        request.kind,
        request.definition?.pluginId,
        request.definition?.definitionVersion,
      ]);
      const previous = this.active.get(key);
      this.active.set(key, own);
      previous?.cancel();
      const stopped = new Promise<Result<never, ReadFailure>>((resolve) => {
        subscription = own.onCancel(() => resolve(failure("cancelled")));
      });
      const upstream = cancellation.onCancel(() => own.cancel());
      try {
        timer = this.options.clock.schedule(this.options.timeoutMilliseconds, () => own.cancel());
        const result = await Promise.race([this.perform(request, own), stopped]);
        return own.cancelled || this.active.get(key) !== own ? failure("cancelled") : result;
      } finally {
        release(upstream);
      }
    } catch {
      return failure(own.cancelled ? "cancelled" : "unavailable");
    } finally {
      own.cancel();
      release(subscription);
      release(timer);
      if (key !== undefined && this.active.get(key) === own) this.active.delete(key);
    }
  }

  private async perform(request: MetadataRequest, cancellation: Cancellation): Promise<Result<ResolvedPlan, ReadFailure>> {
    try {
      if (cancellation.cancelled) return failure("cancelled");
      const started = this.options.clock.now();
      const resolved = this.options.resolveEndpoint(request);
      const endpoint = Object.freeze({ url: resolved.url, headers: Object.freeze({ ...resolved.headers }) });
      const permission = await this.options.authorization.authorize(request, endpoint, cancellation);
      if (cancellation.cancelled) return failure("cancelled");
      if (!permission.success || !validGrant(permission.data, started)) return failure("unauthorized");
      const grant = { ...permission.data };
      if (!validGrant(grant, this.options.clock.now())) return failure("unauthorized");
      const response = await this.options.transport.read({ endpoint, maxBytes: this.options.maxResponseBytes, cancellation });
      if (cancellation.cancelled) return failure("cancelled");
      if (!response.success)
        return failure(response.error.code === "oversize" ? "invalid-plan" : response.error.code === "cancelled" ? "cancelled" : "unavailable");
      if (response.data.status === 401 || response.data.status === 403) return failure("unauthorized");
      if (response.data.status === 404) return failure("not-found");
      if (response.data.status !== 200) return failure("unavailable");
      if (!withinBytes(response.data.body, this.options.maxResponseBytes)) return failure("invalid-plan");
      let input: unknown;
      try {
        input = JSON.parse(response.data.body);
      } catch {
        return failure("invalid-plan");
      }
      return validatePlan(input, request, grant, started, this.options.clock.now());
    } catch {
      return failure(cancellation.cancelled ? "cancelled" : "unavailable");
    }
  }
}

function snapshotRequest(request: MetadataRequest): MetadataRequest {
  const context = Object.freeze({
    scope: Object.freeze({ hostId: request.context.scope.hostId, tenantId: request.context.scope.tenantId }),
    authorizationId: request.context.authorizationId,
  });
  const definition = request.definition;
  return Object.freeze({
    kind: request.kind,
    context,
    ...(definition ? { definition: Object.freeze({ pluginId: definition.pluginId, definitionVersion: definition.definitionVersion }) } : {}),
  });
}
