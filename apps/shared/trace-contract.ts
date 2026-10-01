import type { ActivationContext, ScopedGeneration } from "@pylons/contracts";
import { LoggerFactory } from "slf";

export type TraceKind = "evaluation" | "activation" | "invocation" | "acquired" | "cleanup" | "replacement";
export interface RemoteEvent {
  readonly kind: TraceKind;
  readonly plugin: string;
  readonly tenant: string;
  readonly generation: string;
  readonly desired: string;
  readonly applied: string;
  readonly resource?: string;
  readonly subject?: string;
  readonly transaction?: string;
  readonly requestMatches?: boolean;
}
export function remoteEvent(kind: TraceKind, plugin: string, generation?: ScopedGeneration, extra: Partial<RemoteEvent> = {}): void {
  const event: RemoteEvent = {
    kind,
    plugin,
    tenant: generation?.scope.tenantId ?? "shared",
    generation: generation?.generationId ?? "module",
    desired: generation?.desiredRevision ?? "none",
    applied: generation?.appliedRevision ?? "none",
    ...extra,
  };
  const receiver: unknown = Reflect.get(globalThis, "__pylonsDemoEvent");
  if (typeof receiver === "function") receiver(event);
  LoggerFactory.getLogger(plugin === "basic-validation" ? "pylons:demo-basic" : "pylons:demo-reference").debug(`demo ${kind}`);
}
export function acquired(context: ActivationContext, plugin: string, resource: string, cleanup: () => void, throws = false): void {
  remoteEvent("acquired", plugin, context.generation, { resource });
  context.resources.own({
    async cleanup() {
      cleanup();
      remoteEvent("cleanup", plugin, context.generation, { resource });
      if (throws) throw new Error("SECRET_ERROR_SENTINEL");
      return { success: true, data: undefined };
    },
  });
}
