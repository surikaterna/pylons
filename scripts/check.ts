import { verifyPackages } from "./inventory.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";

await main(async () => {
  const root = process.argv[2];
  if (!root || process.argv.length !== 3) throw new FoundationError("Exactly one inventory root is required");
  const paths = await verifyPackages(root);
  const publicCount = paths.filter((path) => /\/packages\/(contracts|core|source-http)\/package\.json$/.test(path)).length;
  console.log(
    `Pylons inventory: ${paths.length - publicCount} private manifests; ${publicCount} publishable packages; local consumer verification is a separate gate.`,
  );
});
