import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loaderE2E } from "./loader-e2e.js";
import { loaderDeclarations, loaderInstalledGraph, loaderJavascript, validateLoaderTar } from "./loader-package-graph.js";
import { capture, validateTarContents } from "./pack-check.js";
import { validateContractsManifest, validateLoaderManifest } from "./package-policy.js";
import { FoundationError } from "./policy.js";

async function pack(root: string, temp: string, name: "loader-mf" | "contracts") {
  capture([process.execPath, "pm", "pack", "--destination", temp], join(root, `packages/${name}`));
  const path = join(temp, `pylons-${name}-0.0.0.tgz`);
  const files = capture(["tar", "-tzf", path], temp).trim().split("\n");
  if (name === "contracts") validateTarContents(files);
  else validateLoaderTar(files);
  const manifest: unknown = JSON.parse(capture(["tar", "-xOf", path, "package/package.json"], temp));
  if (name === "contracts") validateContractsManifest(manifest);
  else validateLoaderManifest(manifest);
  if (files.some((file) => /vendor-context|ambient|src\/|test\//.test(file))) throw new FoundationError("loader-packed-private-input");
  console.log(
    JSON.stringify({
      package: name,
      files,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    }),
  );
  return path;
}

async function declarations(root: string, cwd: string, target: "browser" | "server") {
  const name = target === "browser" ? "createBrowserLoader" : "createServerLoader";
  await writeFile(
    join(cwd, "consumer.ts"),
    `import { ${name}, type LoaderOptions } from '@pylons/loader-mf/${target}'; import type { ArtifactLoader } from '@pylons/contracts'; export function typed(options: LoaderOptions): ArtifactLoader { return ${name}(options); }`,
  );
  await writeFile(
    join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
      files: ["consumer.ts"],
    }),
  );
  const command = [process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json", "--listFiles"];
  for (const args of [command, [...command, "--module", "ESNext", "--moduleResolution", "Bundler"]]) {
    const files = capture(args, cwd).trim().split("\n");
    loaderDeclarations(files, target);
    console.log(JSON.stringify({ target, declarationCount: files.length, files }));
  }
}

async function consumer(root: string, temp: string, loader: string, contracts: string, target: "browser" | "server") {
  const cwd = join(temp, target);
  await mkdir(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: `pylons-packed-${target}`,
      private: true,
      type: "module",
      dependencies: { "@pylons/loader-mf": loader },
      overrides: { "@pylons/contracts": contracts },
    }),
  );
  console.log(capture([process.execPath, "install"], cwd));
  console.log(JSON.stringify({ target, installed: await loaderInstalledGraph(cwd) }));
  await declarations(root, cwd, target);
  const selected = await loaderJavascript(cwd, target);
  console.log(
    JSON.stringify({
      target,
      javascriptCount: selected.length,
      files: selected,
      sdkDynamicBuiltins: ["path", "vm", "node:module", "node:url"],
      sdkDynamicNote:
        "unmodified universal SDK node helper; browser native script path never calls these builtins; runtime-core utils/load.js also contains unselected computed ESM/System remote alternatives",
    }),
  );
  const source = join(root, `.loader-build/packed-hosts/loader-${target === "browser" ? "browser" : "bun"}-host.js`);
  await copyFile(source, join(cwd, "entry.js"));
  const destination = join(temp, "hosts");
  if (target === "server") await copyFile(join(cwd, "entry.js"), join(cwd, "loader-bun-host.js"));
  if (target === "browser") {
    const result = await Bun.build({ entrypoints: [join(cwd, "entry.js")], target: "browser", outdir: destination, naming: "loader-browser-host.js" });
    if (!result.success) throw new FoundationError("packed-browser-build-failed");
  }
  return cwd;
}

const root = process.cwd();
if (!(await lstat("/tmp/opencode")).isDirectory()) throw new FoundationError("loader-temp-parent");
const temp = await mkdtemp("/tmp/opencode/pylons-loader-pack-");
try {
  const loader = await pack(root, temp, "loader-mf");
  const contracts = await pack(root, temp, "contracts");
  await mkdir(join(temp, "hosts"));
  const server = await consumer(root, temp, loader, contracts, "server");
  await consumer(root, temp, loader, contracts, "browser");
  // Server execution stays inside its own installed consumer, not the browser bundle directory.
  await copyFile(join(temp, "hosts/loader-browser-host.js"), join(server, "loader-browser-host.js"));
  await loaderE2E(root, server);
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log("Actual loader tarballs, chosen target closures and three-host remote execution passed; local sibling override is NOT registry proof.");
