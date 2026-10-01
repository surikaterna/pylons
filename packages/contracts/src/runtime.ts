import type { Cancellation } from "./cancellation.js";
import type { Capability, DefinitionRef, Host } from "./definition.js";
import type { Disposable } from "./disposable.js";
import type { ConfigSideband, Scope } from "./installation.js";
import type { JsonValue } from "./json.js";
import type { Result } from "./parsing.js";

export interface CleanupFailure {
  readonly code: "cleanup-failed";
}
export interface ActivationFailure {
  readonly code: "cancelled" | "initialization-failed" | "unsupported-contract";
}
export interface InvocationFailure {
  readonly code: "cancelled" | "denied" | "unavailable" | "invalid-input" | "provider-failed";
}
export interface RegistrationFailure {
  readonly code: "duplicate-provider" | "closed-generation" | "undeclared-provider";
}

export interface ScopedGeneration {
  readonly scope: Scope;
  readonly definition: DefinitionRef;
  readonly generationId: string;
  readonly desiredRevision: string;
  readonly appliedRevision?: string;
}

// Authority and host resources are request-local; activation receives none of these.
export interface InvocationContext {
  readonly principal: { readonly subjectId: string };
  readonly credential: { readonly reference: string };
  readonly transaction: { readonly id: string };
  readonly cancellation: Cancellation;
  readonly hostContext?: unknown;
}
export interface Provider {
  invoke(input: JsonValue, context: InvocationContext): Promise<Result<JsonValue, InvocationFailure>>;
}
export interface ProviderRegistrar {
  register(capability: Capability, provider: Provider): Result<Disposable, RegistrationFailure>;
}
export interface OwnedResource {
  cleanup(): Promise<Result<undefined, CleanupFailure>>;
}
// The coordinator owns every acquired resource, including those acquired before failed activation.
export interface ResourceOwnership {
  own(resource: OwnedResource): void;
}

export interface ActivationContext {
  readonly generation: ScopedGeneration;
  readonly host: Host;
  readonly configuration: ConfigSideband;
  readonly cancellation: Cancellation;
  readonly providers: ProviderRegistrar;
  readonly resources: ResourceOwnership;
}
export type ConfigReplacement =
  | { readonly kind: "applied"; readonly appliedRevision: string }
  | { readonly kind: "restart-required" }
  | { readonly kind: "failed"; readonly code: "cancelled" | "replacement-failed" };
export interface ActivatedInstance extends OwnedResource {
  replaceConfiguration?(configuration: ConfigSideband, cancellation: Cancellation): Promise<ConfigReplacement>;
}
export interface PluginFactory {
  activate(context: ActivationContext): Promise<Result<ActivatedInstance, ActivationFailure>>;
}

export type RuntimeState =
  | "absent"
  | "disabled"
  | "denied"
  | "unsupported"
  | "blocked"
  | "loading"
  | "activating"
  | "ready"
  | "failed"
  | "stopped"
  | "declaration-only"
  | "restart-required";
export interface RuntimeSnapshot {
  readonly generation: ScopedGeneration;
  readonly extensionId?: string;
  readonly state: RuntimeState;
  readonly failureCode?: "dependency-missing" | "dependency-cycle" | "load-failed" | "activation-failed" | "expired" | "cleanup-failed";
}
export type LifecycleEvent =
  | { readonly kind: "state-changed"; readonly snapshot: RuntimeSnapshot }
  | { readonly kind: "provider-changed"; readonly generation: ScopedGeneration; readonly capability: Capability; readonly ready: boolean };
