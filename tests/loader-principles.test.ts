import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loaderPrinciples } from "../scripts/loader-principles.js";

test("loader production source and all assigned tooling obey the full structural principles", async () => {
  const root = join(import.meta.dir, "..");
  const files = (await readdir(join(root, "packages/loader-mf/src"))).map((name) => `packages/loader-mf/src/${name}`);
  files.push(
    ...(await readdir(join(root, "scripts")))
      .filter((name) => name.startsWith("loader-") || name === "verify-loader-package.ts")
      .map((name) => `scripts/${name}`),
  );
  for (const path of files) {
    const result = loaderPrinciples(await readFile(join(root, path), "utf8"), path);
    console.log(`Loader principles ${path} ${JSON.stringify(result)}`);
    expect(result.functionLines).toBeLessThan(50);
  }
});
