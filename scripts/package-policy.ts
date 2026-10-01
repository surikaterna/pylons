import { FoundationError, record, rejectRuntimeLinks } from "./policy.js";

export const contractsManifest = {
  name: "@pylons/contracts",
  version: "0.0.0",
  type: "module",
  description: "Portable data contracts and injected runtime boundaries for Pylons",
  license: "MIT",
  sideEffects: false,
  files: ["dist", "README.md", "LICENSE"],
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  dependencies: { zod: "3.25.76" },
};

export const coreManifest = {
  name: "@pylons/core",
  version: "0.0.0",
  type: "module",
  description: "Scoped neutral lifecycle coordination for Pylons",
  license: "MIT",
  sideEffects: false,
  files: ["dist", "README.md", "LICENSE"],
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
  dependencies: { "@pylons/contracts": "0.0.0" },
};

export function validateCoreManifest(value: unknown): void {
  rejectRuntimeLinks(value);
  if (!equal(value, coreManifest)) throw new FoundationError("Core manifest must match approved ESM facade and exact dependency");
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const actual = record(left);
  const expected = record(right);
  return Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => equal(actual[key], value));
}

export function validateContractsManifest(value: unknown): void {
  rejectRuntimeLinks(value);
  if (!equal(value, contractsManifest)) throw new FoundationError("Contracts manifest must match approved ESM facade and exact dependency");
}

export type PackageProfile = "contracts" | "core";

export function validateInstalledManifest(value: unknown, profile: PackageProfile = "contracts"): void {
  rejectRuntimeLinks(value);
  const manifest = record(value);
  if (profile === "core" && manifest.name === "@pylons/core") {
    validateCoreManifest(value);
    return;
  }
  if (manifest.name === "@pylons/contracts") {
    validateContractsManifest(value);
    return;
  }
  if (manifest.name !== "zod" || manifest.version !== "3.25.76") throw new FoundationError("Unexpected installed runtime package");
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (manifest[key] !== undefined && Object.keys(record(manifest[key])).length !== 0) throw new FoundationError("Unexpected transitive runtime dependency");
  }
}
