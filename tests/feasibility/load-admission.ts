import { type LoadRequest, parsePluginDefinition } from "@pylons/contracts";

export function eligible(request: LoadRequest, origin: string, target: "bun" | "browser"): boolean {
  const { definition, extension, binding, host } = request;
  if (!parsePluginDefinition(definition).success) return false;
  if (definition.identity.pluginId !== "basic-validation" || definition.identity.definitionVersion !== "1") return false;
  if (extension.id !== "validation" || extension.artifactKey !== "basic" || !extension.hosts.includes(host)) return false;
  if (binding.extensionId !== extension.id || binding.artifactKey !== extension.artifactKey || binding.artifactVersion !== "1") return false;
  if (binding.loaderId !== `private-${target}` || binding.locator !== new URL(`${target}/remoteEntry.js`, origin).href) return false;
  if ((host === "browser") !== (target === "browser") || !/^[a-f0-9]{64}$/.test(binding.integrity.digest)) return false;
  return definition.extensions.some((entry) => JSON.stringify(entry) === JSON.stringify(extension));
}
