import type { Cancellation } from "./cancellation.js";
import type { DefinitionRef, Extension, Host, PluginDefinition } from "./definition.js";
import type { Disposable } from "./disposable.js";
import type { Event } from "./event.js";
import type { ArtifactBinding, Installation, Scope, Validity } from "./installation.js";
import type { Result } from "./parsing.js";
import type { ResolvedPlan } from "./plan.js";
import type { LifecycleEvent, PluginFactory } from "./runtime.js";

export interface VerifiedContext {
  readonly scope: Scope;
  readonly authorizationId: string;
}
export interface SourceFailure {
  readonly code: "cancelled" | "unavailable" | "unauthorized" | "invalid-plan";
}
export interface CatalogFailure {
  readonly code: "cancelled" | "not-found" | "unavailable" | "invalid-definition";
}
export interface LoadFailure {
  readonly code: "cancelled" | "denied" | "unsupported-host" | "integrity-mismatch" | "load-failed" | "invalid-factory";
}

export interface PlanSource {
  read(context: VerifiedContext, cancellation: Cancellation): Promise<Result<ResolvedPlan, SourceFailure>>;
  readonly onInvalidation?: Event<{ readonly scope: Scope }>;
}
export interface DefinitionCatalog {
  read(definition: DefinitionRef, cancellation: Cancellation): Promise<Result<PluginDefinition, CatalogFailure>>;
}
export interface LoadRequest {
  readonly definition: PluginDefinition;
  readonly extension: Extension;
  readonly host: Host;
  readonly binding: ArtifactBinding;
  readonly cancellation: Cancellation;
}
export interface ArtifactLoader {
  load(request: LoadRequest): Promise<Result<PluginFactory, LoadFailure>>;
}
export interface AdmissionRequest {
  readonly context: VerifiedContext;
  readonly selection: Installation;
  readonly definition: PluginDefinition;
  readonly host: Host;
  readonly extension?: Extension;
  readonly binding?: ArtifactBinding;
  readonly validity: Validity;
}
export type AdmissionDecision = { readonly kind: "allow" } | { readonly kind: "deny"; readonly code: "unauthorized" | "untrusted" | "expired" | "unsupported" };
export interface AdmissionPolicy {
  evaluate(request: AdmissionRequest): Promise<AdmissionDecision>;
}
export interface RuntimeObserver {
  observe(event: LifecycleEvent): void;
}
export interface Diagnostic {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly code:
    | "source-unavailable"
    | "plan-invalid"
    | "admission-denied"
    | "unsupported-kind"
    | "load-failed"
    | "activation-failed"
    | "cleanup-failed"
    | "restart-required";
  readonly correlation?: string;
}
// Implementations must bound correlation length and use host-approved opaque IDs, never payload text.
export interface DiagnosticSink {
  write(diagnostic: Diagnostic): void;
}
export interface Clock {
  now(): number;
  schedule(delayMilliseconds: number, callback: () => void): Disposable;
}
