import type { ArtifactLoader, LoadRequest } from "@pylons/contracts";
import type { LoaderOptions } from "@pylons/loader-mf/server";
import { exercise } from "./loader-exercise.js";

export async function competing(
  actual: ArtifactLoader,
  options: LoaderOptions,
  request: LoadRequest,
  scenario: string,
  create: (options: LoaderOptions) => ArtifactLoader,
) {
  if (scenario !== "version-race" && scenario !== "alias") return exercise(actual, request, scenario);
  const mapping = options.mappings[0];
  if (!mapping) throw new Error("missing-mapping");
  const definition =
    scenario === "alias" ? { ...request.definition, identity: { ...request.definition.identity, pluginId: "alias-plugin" } } : request.definition;
  const alternate = new URL(request.binding.locator);
  alternate.hostname = "localhost";
  const binding = scenario === "alias" ? { ...request.binding, locator: alternate.href } : { ...request.binding, artifactVersion: "2" };
  const rival = create({
    ...options,
    trustedOrigins: [...options.trustedOrigins, alternate.origin],
    mappings: [{ ...mapping, definition, binding, executableFiles: [binding.locator] }],
  });
  const first = actual.load(request);
  const second = await rival.load({ ...request, definition, binding });
  if (second.success || second.error.code !== "denied") throw new Error("version-reservation-failed");
  if (!(await first).success) throw new Error("first-version-failed");
  return { ...(await exercise(actual, request, "positive")), rivalCode: second.error.code };
}
