import type { Host } from "@pylons/contracts";
import { fixture } from "./loader-fixture.js";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function settings(origin: string, host: Host) {
  const response = await fetch(new URL("metadata", origin));
  const metadata: unknown = await response.json();
  if (!object(metadata) || typeof metadata.digest !== "string" || typeof metadata.scenario !== "string") throw new Error("invalid-metadata");
  const data = fixture(origin, host, metadata.digest);
  const mapping = data.options.mappings[0];
  if (!mapping) throw new Error("invalid-mapping");
  const scenario = metadata.scenario;
  if (scenario === "denied") data.options = { ...data.options, trustedPublisherIds: [] };
  if (scenario === "origin") data.options = { ...data.options, trustedOrigins: ["https://denied.invalid"] };
  if (scenario === "binding") data.request = { ...data.request, binding: { ...data.request.binding, artifactVersion: "2" } };
  if (scenario === "wrong-export") data.options = { ...data.options, mappings: [{ ...mapping, exportName: "missing" }] };
  if (scenario === "fanout") {
    const files = metadata.executableFiles;
    if (!Array.isArray(files) || !files.every((file: unknown) => typeof file === "string") || files.length < 2) throw new Error("invalid-fanout-proof");
    data.options = {
      ...data.options,
      mappings: [
        { ...mapping, executableFiles: files.map((file: string) => (file === "remoteEntry.js" ? mapping.binding.locator : new URL(file, origin).href)) },
      ],
    };
  }
  if (scenario === "size") data.options = { ...data.options, limits: { ...data.options.limits, maximumBytes: 16 } };
  return { ...data, scenario };
}
