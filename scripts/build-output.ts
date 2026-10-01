import { lstat, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { FoundationError } from "./policy.js";

export async function cleanOwnedOutput(root: string): Promise<void> {
  const output = join(root, ".foundation-build");
  const existing = await lstat(output).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new FoundationError("Refusing linked build directory");
  await rm(output, { recursive: true, force: true });
}

export async function verifyOutputs(root: string): Promise<void> {
  const files = await readdir(join(root, "scripts"));
  for (const file of files.filter((name) => name.endsWith(".ts"))) {
    for (const extension of [".js", ".d.ts"]) {
      const output = join(root, ".foundation-build", "scripts", file.replace(/\.ts$/, extension));
      if (!(await stat(output)).isFile()) throw new FoundationError("Missing compiled tooling output");
    }
  }
}
