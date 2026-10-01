import { FoundationError } from "./policy.js";

export function validateTarContents(contents: readonly string[]): void {
  const required = ["package/package.json", "package/LICENSE", "package/README.md", "package/dist/index.js", "package/dist/index.d.ts"];
  if (required.some((file) => !contents.includes(file))) throw new FoundationError("Missing package tarball output");
  for (const file of contents) {
    if (file.includes("..") || (!/^package\/dist\/[a-z-]+\.(js|d\.ts)$/.test(file) && !required.includes(file))) {
      throw new FoundationError("Unexpected tarball content");
    }
  }
}

export function capture(command: readonly string[], cwd: string): string {
  const result = Bun.spawnSync([...command], { cwd, timeout: 60_000 });
  if (result.exitCode !== 0) {
    console.error(result.stdout.toString(), result.stderr.toString());
    throw new FoundationError(`Package verification subprocess failed (${result.exitCode})`);
  }
  return result.stdout.toString();
}
