import { join } from "node:path";
import { cleanOwnedOutput, verifyOutputs } from "./build-output.js";
import { verifyPackages } from "./inventory.js";
import { main, run } from "./process.js";

await main(async () => {
  const root = process.cwd();
  await verifyPackages(root);
  await cleanOwnedOutput(root);
  run([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.build.json"], root);
  await verifyOutputs(root);
  console.log("Foundation build: tooling JavaScript and declarations verified (not runtime packages).");
});
