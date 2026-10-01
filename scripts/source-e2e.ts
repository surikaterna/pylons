import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { capture } from "./pack-check.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";
import { sourceRuntimeConsumer } from "./source-consumer-fixture.js";

await main(async () => {
  const root = process.cwd();
  if (!(await lstat("/tmp/opencode")).isDirectory()) throw new FoundationError("Verified temporary parent required");
  const temp = await mkdtemp("/tmp/opencode/pylons-source-e2e-");
  try {
    const fixture = sourceRuntimeConsumer
      .replace("Packed source canonical ESM", "Compiled source canonical ESM")
      .replaceAll("'@pylons/source-http/fetch'", JSON.stringify(join(root, "packages/source-http/dist/fetch.js")))
      .replaceAll("'@pylons/source-http'", JSON.stringify(join(root, "packages/source-http/dist/index.js")))
      .replaceAll("'@pylons/contracts'", JSON.stringify(join(root, "packages/contracts/dist/index.js")));
    await writeFile(join(temp, "consumer.mjs"), fixture);
    console.log(capture([process.execPath, "consumer.mjs"], temp));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
