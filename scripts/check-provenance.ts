import { main } from "./process.js";
import { verifySpecs } from "./provenance.js";

await main(async () => {
  await verifySpecs(process.cwd());
  console.log("Foundation provenance: three proposals restore to exact Ghost source hashes; local links/anchors verified.");
});
