import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runtimeConsumer } from "./consumer-fixture.js";
import { run } from "./process.js";

export async function contractsE2e(root: string): Promise<void> {
  const temp = await mkdtemp("/tmp/opencode/pylons-contracts-e2e-");
  try {
    const entry = join(temp, "consumer.mjs");
    await writeFile(entry, runtimeConsumer(join(root, "packages/contracts/dist/index.js")));
    run([process.execPath, entry], temp);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
