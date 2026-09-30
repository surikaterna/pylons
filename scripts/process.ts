import { FoundationError } from "./policy.js";

export function run(command: readonly string[], cwd: string): void {
  const result = Bun.spawnSync([...command], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    timeout: 60_000,
  });
  if (result.exitCode !== 0) {
    throw new FoundationError(`Foundation subprocess failed (${result.exitCode})`);
  }
}

export async function main(action: () => Promise<void>): Promise<void> {
  try {
    if (Bun.version !== "1.4.2") throw new FoundationError("Bun 1.4.2 is required; no runtime fallback");
    await action();
  } catch {
    console.error("Foundation check failed; review fixture or pinned tooling.");
    process.exitCode = 1;
  }
}
