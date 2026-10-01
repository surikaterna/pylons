import type { Cancellation, Clock, DefinitionRef, Result, VerifiedContext } from "@pylons/contracts";

export interface MetadataRequest {
  readonly kind: "plan" | "definition";
  readonly context: VerifiedContext;
  readonly definition?: DefinitionRef;
}
export interface MetadataEndpoint {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}
export interface MetadataGrant {
  readonly sourceId: string;
  readonly authorizedUntil: number;
  readonly maxFreshnessMilliseconds: number;
}
// Policy checks metadata origin/credentials, not artifact trust or installation permission.
export interface SourceAuthorization {
  authorize(
    request: MetadataRequest,
    endpoint: MetadataEndpoint,
    cancellation: Cancellation,
  ): Promise<Result<MetadataGrant, { readonly code: "unauthorized" }>>;
}
export interface TransportRequest {
  readonly endpoint: MetadataEndpoint;
  readonly maxBytes: number;
  readonly cancellation: Cancellation;
}
export type TransportFailure = { readonly code: "cancelled" | "unavailable" | "oversize" };
export interface MetadataResponse {
  readonly status: number;
  readonly body: string;
}
export interface HttpTransport {
  read(request: TransportRequest): Promise<Result<MetadataResponse, TransportFailure>>;
}
export interface HttpSourceOptions {
  readonly transport: HttpTransport;
  readonly resolveEndpoint: (request: MetadataRequest) => MetadataEndpoint;
  readonly authorization: SourceAuthorization;
  readonly clock: Clock;
  readonly maxResponseBytes: number;
  readonly timeoutMilliseconds: number;
}
