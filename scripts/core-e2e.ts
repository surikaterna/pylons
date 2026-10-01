import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { coreRuntimeConsumer } from "./core-consumer-fixture.js";
import { run } from "./process.js";

export async function coreE2e(root: string): Promise<void> {
  const temp = await mkdtemp("/tmp/opencode/pylons-core-e2e-");
  try {
    const entry = join(temp, "consumer.mjs");
    const consumer = coreRuntimeConsumer
      .replace('"@pylons/core"', JSON.stringify(join(root, "packages/core/dist/index.js")))
      .replace('"@pylons/contracts"', JSON.stringify(join(root, "packages/contracts/dist/index.js")));
    await writeFile(entry, consumer);
    run([process.execPath, entry], temp);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
