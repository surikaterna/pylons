import { type ArtifactBinding, type LoadRequest, parsePluginDefinition } from "@pylons/contracts";
import { LoadError } from "./transport.js";
import type { ArtifactMapping, LoaderOptions } from "./types.js";

const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;

function origin(value: string): boolean {
  const url = new URL(value);
  return /^(https?:)$/.test(url.protocol) && url.origin === value;
}

function validMapping(mapping: ArtifactMapping, options: LoaderOptions): boolean {
  const { binding } = mapping;
  const url = new URL(binding.locator);
  if (url.username || url.password || url.hash || !options.trustedOrigins.includes(url.origin)) return false;
  if (!identifier.test(mapping.publisherId) || !options.trustedPublisherIds.includes(mapping.publisherId) || !identifier.test(mapping.container)) return false;
  if (!/^\.\/[A-Za-z0-9_-]{1,128}$/.test(mapping.expose) || !identifier.test(mapping.exportName)) return false;
  if (mapping.profile !== "single-script" || mapping.executableFiles.length !== 1 || mapping.executableFiles[0] !== binding.locator) return false;
  if (binding.integrity.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(binding.integrity.digest)) return false;
  if (!binding.artifactVersion || !binding.loaderId) return false;
  const definition = parsePluginDefinition(mapping.definition);
  return (
    definition.success &&
    definition.data.extensions.some(
      (entry) => entry.id === binding.extensionId && entry.artifactKey === binding.artifactKey && entry.hosts.includes(mapping.host),
    )
  );
}

export function admittedOptions(options: LoaderOptions): LoaderOptions | undefined {
  try {
    const limits = options.limits;
    if (
      ![limits.timeoutMilliseconds, limits.maximumBytes, limits.maximumMappings, limits.maximumMetadataCharacters, limits.maximumReservations].every(positive)
    )
      return undefined;
    if (limits.timeoutMilliseconds > 2147483647 || typeof options.diagnostics.write !== "function") return undefined;
    if (!identifier.test(options.operatorId) || !options.trustedOperatorIds.includes(options.operatorId)) return undefined;
    if (options.mappings.length > options.limits.maximumMappings || !options.trustedOrigins.every(origin)) return undefined;
    const serialized = JSON.stringify({ ...options, diagnostics: undefined });
    if (serialized.length > options.limits.maximumMetadataCharacters) return undefined;
    if (!options.mappings.every((mapping) => validMapping(mapping, options))) return undefined;
    return {
      ...options,
      limits: Object.freeze({ ...options.limits }),
      trustedOrigins: Object.freeze([...options.trustedOrigins]),
      trustedOperatorIds: Object.freeze([...options.trustedOperatorIds]),
      trustedPublisherIds: Object.freeze([...options.trustedPublisherIds]),
      mappings: Object.freeze(options.mappings.map(detach)),
    };
  } catch {
    return undefined;
  }
}

function detach(mapping: ArtifactMapping): ArtifactMapping {
  const definition = parsePluginDefinition(mapping.definition);
  if (!definition.success) throw new LoadError("load-failed");
  return Object.freeze({
    ...mapping,
    definition: definition.data,
    binding: Object.freeze({ ...mapping.binding, integrity: Object.freeze({ ...mapping.binding.integrity }) }),
    executableFiles: Object.freeze([...mapping.executableFiles]),
  });
}

export function select(request: LoadRequest, options: LoaderOptions): ArtifactMapping | undefined {
  const definition = parsePluginDefinition(request.definition);
  if (!definition.success || !request.extension.hosts.includes(request.host)) return undefined;
  const extension = definition.data.extensions.find((entry) => entry.id === request.extension.id);
  const selected = parsePluginDefinition({ ...definition.data, extensions: [request.extension] });
  if (!extension || !selected.success || JSON.stringify(extension) !== JSON.stringify(selected.data.extensions[0])) return undefined;
  const matches = options.mappings.filter(
    (mapping) =>
      mapping.host === request.host && JSON.stringify(mapping.definition) === JSON.stringify(definition.data) && sameBinding(mapping.binding, request.binding),
  );
  return matches.length === 1 && matches[0]?.binding.extensionId === extension.id && matches[0]?.binding.artifactKey === extension.artifactKey
    ? matches[0]
    : undefined;
}

function sameBinding(left: ArtifactBinding, right: ArtifactBinding): boolean {
  const keys = ["extensionId", "artifactKey", "artifactVersion", "locator", "loaderId", "integrity"];
  if (Object.keys(right).length !== keys.length || Object.keys(right).some((key) => !keys.includes(key))) return false;
  if (Object.keys(right.integrity).length !== 2) return false;
  return (
    left.extensionId === right.extensionId &&
    left.artifactKey === right.artifactKey &&
    left.artifactVersion === right.artifactVersion &&
    left.locator === right.locator &&
    left.loaderId === right.loaderId &&
    left.integrity.algorithm === right.integrity.algorithm &&
    left.integrity.digest === right.integrity.digest
  );
}
