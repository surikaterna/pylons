import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installedGraph, javascriptClosure, validateDeclarationFiles } from "./closure.js";
import { runtimeConsumer, typeConsumer } from "./consumer-fixture.js";
import { verifyPackages } from "./inventory.js";
import { capture, validateTarContents } from "./pack-check.js";
import { validateContractsManifest } from "./package-policy.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";

async function pack(root: string, temp: string): Promise<string> {
  capture([process.execPath, "pm", "pack", "--destination", temp], join(root, "packages/contracts"));
  const tarballs = (await readdir(temp)).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1 || !tarballs[0]) throw new FoundationError("Expected one actual Bun tarball");
  const tarball = join(temp, tarballs[0]);
  const contents = capture(["tar", "-tzf", tarball], temp).trim().split("\n");
  validateTarContents(contents);
  validateContractsManifest(JSON.parse(capture(["tar", "-xOf", tarball, "package/package.json"], temp)));
  console.log(
    `Tarball SHA256 ${createHash("sha256")
      .update(await readFile(tarball))
      .digest("hex")}; ${contents.length} files; contents ${JSON.stringify(contents)}`,
  );
  return tarball;
}

async function consumer(root: string, temp: string, tarball: string): Promise<void> {
  const cwd = join(temp, "consumer");
  await mkdir(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "pylons-clean-consumer", private: true, type: "module", dependencies: { "@pylons/contracts": tarball } }),
  );
  console.log(capture([process.execPath, "install"], cwd));
  console.log(`Installed runtime graph ${JSON.stringify(await installedGraph(cwd))}`);
  await writeFile(join(cwd, "consumer.mjs"), runtimeConsumer("@pylons/contracts"));
  console.log(capture([process.execPath, "consumer.mjs"], cwd));
  await writeFile(join(cwd, "consumer.ts"), typeConsumer);
  await writeFile(
    join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
      files: ["consumer.ts"],
    }),
  );
  const compiler = [process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json", "--listFiles"];
  const files = capture(compiler, cwd).trim().split("\n");
  validateDeclarationFiles(files);
  console.log(
    `Declaration closure: ${files.length} files; ${files.filter((file) => /\/zod\/v3\//.test(file)).length} selected Zod v3 declarations; zero forbidden files.`,
  );
  console.log(`Consumer command ${JSON.stringify(compiler)}; declaration closure ${JSON.stringify(files)}`);
  const bundler = [...compiler, "--module", "ESNext", "--moduleResolution", "Bundler"];
  validateDeclarationFiles(capture(bundler, cwd).trim().split("\n"));
  console.log(`Consumer Bundler command ${JSON.stringify(bundler)} passed`);
  const javascript = await javascriptClosure(join(cwd, "node_modules/@pylons/contracts/dist/index.js"), cwd);
  console.log(`Selected JavaScript closure: ${javascript.length} files ${JSON.stringify(javascript)}`);
}

await main(async () => {
  const root = process.cwd();
  const paths = await verifyPackages(root);
  if (paths.length !== 2) throw new FoundationError("Actual contracts manifest required");
  if (!(await lstat("/tmp/opencode")).isDirectory()) throw new FoundationError("Verified temporary parent required");
  const temp = await mkdtemp("/tmp/opencode/pylons-contracts-pack-");
  try {
    await consumer(root, temp, await pack(root, temp));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  console.log("Actual Bun tarball, clean ESM/ES2022 consumers and installed/selected closures passed; NOT registry publication.");
});
