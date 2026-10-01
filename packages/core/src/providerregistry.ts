import type { Capability, Provider, ProviderRegistrar, ScopedGeneration } from "@pylons/contracts";
import { capabilityKey } from "./compatibility.js";
import type { Observation } from "./observation.js";

export class ProvisionalProviders implements ProviderRegistrar {
  private readonly providers = new Map<string, { readonly capability: Capability; readonly provider: Provider }>();
  private closed = false;
  private published = false;

  constructor(
    private readonly declared: readonly Capability[],
    private readonly generation: ScopedGeneration,
    private readonly observation: Observation,
  ) {}

  register(capability: Capability, provider: Provider): ReturnType<ProviderRegistrar["register"]> {
    if (this.closed) return { success: false, error: { code: "closed-generation" } };
    const key = capabilityKey(capability);
    if (!this.declared.some((value) => capabilityKey(value) === key)) return { success: false, error: { code: "undeclared-provider" } };
    if (this.providers.has(key)) return { success: false, error: { code: "duplicate-provider" } };
    this.providers.set(key, { capability, provider });
    return { success: true, data: { dispose: () => this.remove(key) } };
  }

  private remove(key: string): void {
    const entry = this.providers.get(key);
    this.providers.delete(key);
    if (entry && this.published) this.observation.emit({ kind: "provider-changed", generation: this.generation, capability: entry.capability, ready: false });
  }

  complete(): boolean {
    return this.declared.every((capability) => this.providers.has(capabilityKey(capability)));
  }
  get(capability: Capability): Provider | undefined {
    return this.published && !this.closed ? this.providers.get(capabilityKey(capability))?.provider : undefined;
  }

  publish(): void {
    if (this.closed || this.published) return;
    this.published = true;
    for (const entry of this.providers.values())
      this.observation.emit({ kind: "provider-changed", generation: this.generation, capability: entry.capability, ready: true });
  }

  pause(): void {
    if (!this.published) return;
    this.published = false;
    for (const entry of this.providers.values())
      this.observation.emit({ kind: "provider-changed", generation: this.generation, capability: entry.capability, ready: false });
  }

  close(): void {
    this.closed = true;
    for (const key of [...this.providers.keys()]) this.remove(key);
    this.published = false;
  }
}
