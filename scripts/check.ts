import { verifyPackages } from "./inventory.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";

await main(async () => {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) throw new FoundationError("Exactly one inventory root is required");
  const paths = await verifyPackages(root);
  console.log(`Foundation inventory: ${paths.length} private root manifest; 0 publishable packages; packing N/A (.1).`);
});
