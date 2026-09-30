import { lstat, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { FoundationError } from "./policy.js";
import { run } from "./process.js";

export async function buildContracts(root: string): Promise<void> {
  const packageRoot = join(root, "packages/contracts");
  const output = join(packageRoot, "dist");
  const existing = await lstat(output).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new FoundationError("Refusing linked contracts build directory");
  await rm(output, { recursive: true, force: true });
  run([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "packages/contracts/tsconfig.build.json"], root);
  for (const file of await readdir(join(packageRoot, "src"))) {
    for (const extension of [".js", ".d.ts"]) {
      if (!(await stat(join(output, file.replace(/\.ts$/, extension)))).isFile()) throw new FoundationError("Missing contracts compiler output");
    }
  }
}
