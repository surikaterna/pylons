import type { Capability, DefinitionRef } from "@pylons/contracts";

export function compatible(required: string, actual: string): boolean {
  return required === actual;
}

export function capabilityKey(capability: Capability): string {
  return JSON.stringify([capability.capabilityId, capability.contractVersion]);
}

export function definitionKey(definition: DefinitionRef): string {
  return JSON.stringify([definition.pluginId, definition.definitionVersion]);
}
