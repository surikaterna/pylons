export class FoundationError extends Error {
  override readonly name = "FoundationError";
}

export const foundationManifest = Object.freeze({
  name: "pylons-foundation",
  private: true,
  type: "module",
  packageManager: "bun@1.4.2",
  workspaces: Object.freeze([
    "packages/contracts",
    "packages/core",
    "packages/source-http",
    "packages/loader-mf",
    "plugins/basic-validation",
    "apps/web-server",
    "apps/browser",
    "apps/cli",
    "apps/fixture-server",
  ]),
  scripts: Object.freeze({
    lint: "biome check scripts tests apps plugins/basic-validation/src packages/contracts/src packages/contracts/test packages/core/src packages/core/test packages/source-http/src packages/source-http/test packages/loader-mf/src packages/loader-mf/test && bun scripts/check.ts . && bun scripts/check-provenance.ts",
    typecheck:
      "bun node_modules/typescript/bin/tsc --project packages/contracts/tsconfig.build.json && bun node_modules/typescript/bin/tsc --project packages/core/tsconfig.build.json && bun node_modules/typescript/bin/tsc --project packages/source-http/tsconfig.build.json && bun node_modules/typescript/bin/tsc --project packages/source-http/tsconfig.fetch.json && bun node_modules/typescript/bin/tsc --project packages/loader-mf/tsconfig.build.json && bun node_modules/typescript/bin/tsc --project tsconfig.json && bun node_modules/typescript/bin/tsc --project packages/contracts/tsconfig.json && bun node_modules/typescript/bin/tsc --project packages/core/tsconfig.json",
    test: "bun test tests packages/contracts/test packages/core/test packages/source-http/test packages/loader-mf/test",
    build: "bun scripts/build.ts && bun run build:feasibility && bun run build:loader",
    "test:e2e": "bun scripts/e2e.ts && bun scripts/source-e2e.ts && bun run test:feasibility:e2e && bun run test:loader:e2e",
    "verify:packages":
      "bun scripts/verify-packages.ts && bun scripts/verify-core-package.ts && bun scripts/verify-source-package.ts && bun scripts/verify-loader-package.ts",
    "build:loader": "bun scripts/loader-build.ts",
    "test:loader:e2e": "bun scripts/loader-e2e.ts",
    "build:feasibility": "bun scripts/feasibility-build.ts",
    "test:feasibility": "bun test tests/feasibility",
    "test:feasibility:e2e": "bun scripts/feasibility-e2e.ts",
  }),
  devDependencies: Object.freeze({
    "@pylons/contracts": "workspace:*",
    "@pylons/core": "workspace:*",
    "@pylons/source-http": "workspace:*",
    "@pylons/loader-mf": "workspace:*",
    "@types/debug": "4.1.12",
    "@module-federation/enhanced": "2.9.0",
    "@module-federation/runtime": "2.9.0",
    "@module-federation/sdk": "2.9.0",
    webpack: "5.106.2",
    slf: "2.1.0",
    "slf-debug": "0.3.2",
    debug: "4.4.3",
    "playwright-core": "1.63.0",
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
  if (JSON.stringify(manifest.workspaces) !== JSON.stringify(foundationManifest.workspaces)) {
    throw new FoundationError("Only exact approved workspaces are allowed");
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
