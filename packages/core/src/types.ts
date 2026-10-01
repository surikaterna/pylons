import type {
  AdmissionPolicy,
  ArtifactBinding,
  ArtifactLoader,
  Cancellation,
  Capability,
  Clock,
  Contribution,
  DefinitionRef,
  DiagnosticSink,
  Event,
  Host,
  InvocationContext,
  InvocationFailure,
  JsonValue,
  PlanSource,
  Provider,
  Result,
  RuntimeObserver,
  RuntimeSnapshot,
  VerifiedContext,
} from "@pylons/contracts";

export interface Bounds {
  readonly source: number;
  readonly policy: number;
  readonly load: number;
  readonly activation: number;
  readonly invocation: number;
  readonly replacement: number;
  readonly cleanup: number;
}

export interface AuthorizationRequest {
  readonly verifiedContext: VerifiedContext;
  readonly capability: Capability;
  readonly invocation: InvocationContext;
}

export interface InvocationAuthority {
  authorize(request: AuthorizationRequest): Promise<{ readonly kind: "allow" } | { readonly kind: "deny" }>;
}

export interface HostCapability {
  readonly capability: Capability;
  readonly provider: Provider;
  isReady(): boolean;
}

export interface VersionRequest {
  readonly definition: DefinitionRef;
  readonly extensionId: string;
  readonly host: Host;
  readonly binding: ArtifactBinding;
}

export interface VersionOwnership {
  reserve(request: VersionRequest): boolean;
}

export interface RuntimeOptions {
  readonly context: VerifiedContext;
  readonly host: Host;
  readonly hostContractVersion: string;
  readonly source: PlanSource;
  readonly loader: ArtifactLoader;
  readonly policy: AdmissionPolicy;
  readonly authority: InvocationAuthority;
  readonly clock: Clock;
  readonly observer: RuntimeObserver;
  readonly diagnostics: DiagnosticSink;
  readonly bounds: Bounds;
  readonly supportedContributionKinds: readonly string[];
  readonly securityStartupCapabilities: readonly Capability[];
  readonly hostCapabilities: readonly HostCapability[];
  readonly versionOwnership: VersionOwnership;
}

export interface CoreFailure {
  readonly code: "closed" | "cancelled" | "timeout" | "invalid-plan" | "unavailable" | "blocked" | "restart-required" | "provider-not-ready";
}

export interface MetadataEntry {
  readonly pluginId: string;
  readonly definitionVersion: string;
  readonly contributions: readonly Contribution[];
}

export interface Runtime {
  readonly onState: Event<RuntimeSnapshot>;
  refresh(): Promise<Result<undefined, CoreFailure>>;
  metadata(): readonly MetadataEntry[];
  startup(): Promise<Result<undefined, CoreFailure>>;
  demand(capability: Capability, cancellation: Cancellation): Promise<Result<undefined, CoreFailure>>;
  invoke(capability: Capability, input: JsonValue, context: InvocationContext): Promise<Result<JsonValue, InvocationFailure>>;
  snapshots(): readonly RuntimeSnapshot[];
  shutdown(): Promise<Result<undefined, { readonly code: "cleanup-failed" }>>;
}
