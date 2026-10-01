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

export const sourceManifest = {
  name: "@pylons/source-http",
  version: "0.0.0",
  type: "module",
  description: "Authorized bounded HTTP metadata reads for Pylons",
  license: "MIT",
  sideEffects: false,
  files: ["dist", "README.md", "LICENSE"],
  exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./fetch": { types: "./dist/fetch.d.ts", import: "./dist/fetch.js" },
  },
  dependencies: { "@pylons/contracts": "0.0.0" },
};

export function validateSourceManifest(value: unknown): void {
  rejectRuntimeLinks(value);
  if (!equal(value, sourceManifest)) throw new FoundationError("Source manifest must match approved neutral/fetch exports and exact dependency");
}

export const loaderManifest = {
  name: "@pylons/loader-mf",
  version: "0.0.0",
  type: "module",
  description: "Admitted bounded Module Federation factory loading for Pylons",
  license: "MIT",
  sideEffects: false,
  files: ["dist", "README.md", "LICENSE"],
  exports: {
    "./browser": { types: "./dist/browser.d.ts", import: "./dist/browser.js" },
    "./server": { types: "./dist/server.d.ts", import: "./dist/server.js" },
  },
  dependencies: { "@pylons/contracts": "0.0.0", "@module-federation/runtime": "2.9.0", "@module-federation/sdk": "2.9.0" },
};

export function validateLoaderManifest(value: unknown): void {
  rejectRuntimeLinks(value);
  if (!equal(value, loaderManifest)) throw new FoundationError("Loader manifest must match exact target exports and vendor pins");
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

export type PackageProfile = "contracts" | "core" | "source-http";

export function validateInstalledManifest(value: unknown, profile: PackageProfile = "contracts"): void {
  rejectRuntimeLinks(value);
  const manifest = record(value);
  if (profile === "source-http" && manifest.name === "@pylons/source-http") {
    validateSourceManifest(value);
    return;
  }
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
