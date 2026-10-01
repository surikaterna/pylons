import type { PluginFactory } from "@pylons/contracts";

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Callable shape is checked; trusted publisher admission supplies the behavioral contract.
export function factory(value: unknown): value is PluginFactory {
  return object(value) && typeof value.activate === "function";
}

export function namedFactory(module: unknown, name: string): PluginFactory | undefined {
  if (!object(module) || !Object.hasOwn(module, name)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(module, name);
  const value: unknown = descriptor && "value" in descriptor ? descriptor.value : Reflect.get(module, name);
  return factory(value) ? value : undefined;
}
