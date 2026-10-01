import { join } from "node:path";
import { cleanOwnedOutput, verifyOutputs } from "./build-output.js";
import { buildContracts } from "./contracts-build.js";
import { buildCore } from "./core-build.js";
import { verifyPackages } from "./inventory.js";
import { main, run } from "./process.js";
import { buildSource } from "./source-build.js";

await main(async () => {
  const root = process.cwd();
  await verifyPackages(root);
  await cleanOwnedOutput(root);
  run([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.build.json"], root);
  await verifyOutputs(root);
  await buildContracts(root);
  await buildCore(root);
  await buildSource(root);
  console.log("Pylons build: bounded tooling, contracts/core/source ESM/declarations verified.");
});
