export class FoundationError extends Error {
  override readonly name = "FoundationError";
}

export const foundationManifest = Object.freeze({
  name: "pylons-foundation",
  private: true,
  type: "module",
  packageManager: "bun@1.4.2",
  workspaces: Object.freeze(["packages/contracts"]),
  scripts: Object.freeze({
    lint: "biome check scripts tests packages/contracts/src packages/contracts/test && bun scripts/check.ts . && bun scripts/check-provenance.ts",
    typecheck: "bun node_modules/typescript/bin/tsc --project tsconfig.json && bun node_modules/typescript/bin/tsc --project packages/contracts/tsconfig.json",
    test: "bun test tests packages/contracts/test",
    build: "bun scripts/build.ts",
    "test:e2e": "bun scripts/e2e.ts",
    "verify:packages": "bun scripts/verify-packages.ts",
  }),
  devDependencies: Object.freeze({
    "@changesets/cli": "2.29.7",
    "@biomejs/biome": "2.4.13",
    "@types/bun": "1.4.0",
    typescript: "5.9.3",
  }),
});

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FoundationError("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
}

function sameFields(actual: unknown, expected: unknown): boolean {
  const left = record(actual);
  const right = record(expected);
  return Object.keys(left).length === Object.keys(right).length && Object.entries(right).every(([key, value]) => left[key] === value);
}

export function validateManifest(value: unknown): void {
  const manifest = record(value);
  const allowed = Object.keys(foundationManifest);
  if (Object.keys(manifest).some((key) => !allowed.includes(key))) {
    throw new FoundationError("Unexpected root manifest field");
  }
  for (const key of ["name", "private", "type", "packageManager"]) {
    const expected = record(foundationManifest)[key];
    if (manifest[key] !== expected) {
      throw new FoundationError(`Invalid foundation field: ${key}`);
    }
  }
  if (!sameFields(manifest.scripts, foundationManifest.scripts)) {
    throw new FoundationError("Foundation scripts must match bounded gates");
  }
  if (!sameFields(manifest.devDependencies, foundationManifest.devDependencies)) {
    throw new FoundationError("Foundation dependencies must use exact approved pins");
  }
  if (!Array.isArray(manifest.workspaces) || manifest.workspaces.length !== 1 || manifest.workspaces[0] !== "packages/contracts") {
    throw new FoundationError("Only the contracts workspace is approved");
  }
}

export function rejectRuntimeLinks(value: unknown): void {
  const manifest = record(value);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (manifest[field] === undefined) continue;
    const dependencies = record(manifest[field]);
    const linked = Object.values(dependencies).some((version) => typeof version !== "string" || /^(workspace:|file:|link:)/.test(version));
    if (linked) throw new FoundationError("Runtime dependency links are forbidden");
  }
}
