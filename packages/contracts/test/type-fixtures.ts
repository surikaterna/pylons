import type {
  ActivationContext,
  ArtifactBinding,
  Cancellation,
  ConfigSideband,
  Contribution,
  JsonValue,
  PluginDefinition,
  PluginFactory,
  RuntimeState,
} from "../src/index.js";
import { binding, config, definition } from "./fixtures.js";

export const positiveDefinition: PluginDefinition = definition();
export const positiveBinding: ArtifactBinding = binding;
export const positiveConfig: ConfigSideband = config();
export const states: readonly RuntimeState[] = [
  "absent",
  "disabled",
  "denied",
  "unsupported",
  "blocked",
  "loading",
  "activating",
  "ready",
  "failed",
  "stopped",
  "declaration-only",
  "restart-required",
];

// @ts-expect-error canonical metadata must be JSON, not executable
export const executableMetadata: JsonValue = () => 1;
// @ts-expect-error required is an explicit obligation, not an optional default
export const missingRequired: Contribution = { id: "x", kind: "example:x", metadata: {} };
// @ts-expect-error schema version is the literal 1
export const wrongSchema: PluginDefinition = { ...definition(), schemaVersion: 2 };
// @ts-expect-error no legacy displayName on canonical envelope
export const legacyDrift: PluginDefinition = { ...definition(), displayName: "legacy" };
// @ts-expect-error invocation identity cannot be captured from activation
export const capturedIdentity = (context: ActivationContext) => context.principal;
// @ts-expect-error cancellation exposes no host AbortSignal
export const ambientCancellation = (cancellation: Cancellation) => cancellation.signal;
// @ts-expect-error loader/factory returns typed activation errors, never an arbitrary object
export const badFactory: PluginFactory = { activate: async () => ({ success: false, error: { code: "arbitrary" } }) };

export function readonlyConfig(value: ConfigSideband): void {
  // @ts-expect-error config identity is immutable
  value.scope.tenantId = "other";
  // @ts-expect-error revision is immutable
  value.revision = "other";
}
