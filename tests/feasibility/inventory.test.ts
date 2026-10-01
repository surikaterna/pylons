import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyPackages } from "../../scripts/inventory.js";
import { foundationManifest } from "../../scripts/policy.js";

test("private manifest allowlist refuses unapproved apps and publishable harness drift", async () => {
  const root = await mkdtemp("/tmp/opencode/pylons-feasibility-inventory-");
  try {
    await writeFile(join(root, "package.json"), JSON.stringify(foundationManifest));
    const allowed = join(root, "apps/cli");
    await mkdir(allowed, { recursive: true });
    await writeFile(join(allowed, "package.json"), JSON.stringify({ name: "pylons-private-cli", private: true, type: "module" }));
    expect((await verifyPackages(root)).length).toBe(2);
    await writeFile(join(allowed, "package.json"), JSON.stringify({ name: "pylons-private-cli", private: false, type: "module" }));
    await expect(verifyPackages(root)).rejects.toThrow();
    await rm(allowed, { recursive: true });
    const unexpected = join(root, "apps/unapproved");
    await mkdir(unexpected, { recursive: true });
    await writeFile(join(unexpected, "package.json"), JSON.stringify({ name: "private", private: true, type: "module" }));
    await expect(verifyPackages(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
