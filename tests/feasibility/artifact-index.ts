export interface Artifact {
  readonly target: "browser" | "bun";
  readonly expose: "./factory";
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseArtifacts(value: unknown): readonly Artifact[] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("invalid-artifact-index");
  return value.map((entry: unknown) => {
    if (!isObject(entry) || (entry.target !== "browser" && entry.target !== "bun") || entry.expose !== "./factory") throw new Error("invalid-artifact-target");
    if (entry.file !== `${entry.target}/remoteEntry.js` || typeof entry.bytes !== "number" || entry.bytes < 1) throw new Error("invalid-artifact-path");
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("invalid-artifact-hash");
    return { target: entry.target, expose: entry.expose, file: entry.file, bytes: entry.bytes, sha256: entry.sha256 };
  });
}
