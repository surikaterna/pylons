import { verifyPackages } from "./inventory.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";

await main(async () => {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) throw new FoundationError("Exactly one inventory root is required");
  const paths = await verifyPackages(root);
  console.log(`Pylons inventory: 1 private root manifest; ${paths.length - 1} publishable packages; local consumer verification is a separate gate.`);
});
