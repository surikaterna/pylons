import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installedGraph, javascriptClosure, validateDeclarationFiles } from "./closure.js";
import { coreRuntimeConsumer, coreTypeConsumer } from "./core-consumer-fixture.js";
import { verifyPackages } from "./inventory.js";
import { capture, validateTarContents } from "./pack-check.js";
import { validateContractsManifest, validateCoreManifest } from "./package-policy.js";
import { FoundationError } from "./policy.js";
import { main } from "./process.js";

async function pack(root: string, temp: string, name: "contracts" | "core"): Promise<string> {
  capture([process.execPath, "pm", "pack", "--destination", temp], join(root, `packages/${name}`));
  const tarball = join(temp, `pylons-${name}-0.0.0.tgz`);
  const contents = capture(["tar", "-tzf", tarball], temp).trim().split("\n");
  validateTarContents(contents);
  const manifest: unknown = JSON.parse(capture(["tar", "-xOf", tarball, "package/package.json"], temp));
  if (name === "core") validateCoreManifest(manifest);
  else validateContractsManifest(manifest);
  console.log(
    `${name} SHA256 ${createHash("sha256")
      .update(await readFile(tarball))
      .digest("hex")}; ${contents.length} files; ${JSON.stringify(contents)}`,
  );
  return tarball;
}

async function declarations(root: string, cwd: string): Promise<void> {
  await writeFile(join(cwd, "consumer.ts"), coreTypeConsumer);
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
  for (const command of [compiler, [...compiler, "--module", "ESNext", "--moduleResolution", "Bundler"]]) {
    const files = capture(command, cwd).trim().split("\n");
    validateDeclarationFiles(files, "core");
    console.log(`Core strict declarations ${files.length} ${JSON.stringify(command)} ${JSON.stringify(files)}`);
  }
}

async function consumer(root: string, temp: string): Promise<void> {
  const contracts = await pack(root, temp, "contracts");
  const core = await pack(root, temp, "core");
  const cwd = join(temp, "consumer");
  await mkdir(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "pylons-core-clean-consumer",
      private: true,
      type: "module",
      dependencies: { "@pylons/core": core },
      overrides: { "@pylons/contracts": contracts },
    }),
  );
  console.log(capture([process.execPath, "install"], cwd));
  console.log(`Core installed graph ${JSON.stringify(await installedGraph(cwd, "core"))}`);
  await writeFile(join(cwd, "consumer.mjs"), coreRuntimeConsumer);
  console.log(capture([process.execPath, "consumer.mjs"], cwd));
  await declarations(root, cwd);
  const graph = await javascriptClosure(join(cwd, "node_modules/@pylons/core/dist/index.js"), cwd, "core");
  console.log(`Core selected JavaScript ${graph.length} ${JSON.stringify(graph)}`);
}

await main(async () => {
  const root = process.cwd();
  await verifyPackages(root);
  if (!(await lstat("/tmp/opencode")).isDirectory()) throw new FoundationError("Verified temporary parent required");
  const temp = await mkdtemp("/tmp/opencode/pylons-core-pack-");
  try {
    await consumer(root, temp);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  console.log("Core actual sibling tarballs and strict neutral consumers passed; NOT registry proof.");
});
