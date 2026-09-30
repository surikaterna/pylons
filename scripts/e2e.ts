import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FoundationError, foundationManifest } from "./policy.js";
import { main } from "./process.js";

async function checkFixture(root: string, valid: boolean): Promise<void> {
  const manifest = { ...foundationManifest, private: valid };
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  const entry = join(process.cwd(), ".foundation-build/scripts/check.js");
  const result = Bun.spawnSync([process.execPath, entry, root], { timeout: 10_000 });
  const output = result.stdout.toString();
  if (result.exitCode !== (valid ? 0 : 1)) throw new FoundationError("Unexpected compiled fixture exit code");
  if (valid && !output.includes("0 publishable packages")) throw new FoundationError("Missing inventory evidence");
  if (!valid && !result.stderr.toString().includes("Foundation check failed")) {
    throw new FoundationError("Missing failure propagation evidence");
  }
}

await main(async () => {
  const root = await mkdtemp(join(tmpdir(), "pylons-foundation-e2e-"));
  try {
    await checkFixture(root, true);
    await checkFixture(root, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const remains = await lstat(root).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (remains) throw new FoundationError("Foundation fixture cleanup failed");
  console.log("Foundation e2e: compiled tooling valid/invalid subprocess exits and cleanup verified; NOT browser/MF proof.");
});
