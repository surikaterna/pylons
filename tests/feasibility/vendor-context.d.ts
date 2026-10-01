import type { ModuleFederationRuntimePlugin } from "@module-federation/runtime";

declare global {
  // Pinned runtime-core 2.9.0 remote declaration omits this import; alias its actual hook type, never weaken it.
  type ResourceLoadContext = NonNullable<Parameters<NonNullable<ModuleFederationRuntimePlugin["fetch"]>>[3]>;
}
