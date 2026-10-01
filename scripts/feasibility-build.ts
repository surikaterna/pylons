import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/webpack";
import webpack from "webpack";
import { executableInventory, hostGraph } from "./feasibility-graph.js";
import { FoundationError } from "./policy.js";

const root = resolve(import.meta.dir, "..");
const output = resolve(root, ".feasibility-build");

async function compile(target: "browser" | "bun"): Promise<void> {
  const compiler = webpack({
    mode: "development",
    devtool: false,
    target: target === "browser" ? "web" : "node",
    entry: {},
    output: {
      path: resolve(output, target),
      filename: "[name].js",
      publicPath: "",
      library: { type: target === "browser" ? "var" : "commonjs-module", name: "basic_validation" },
    },
    plugins: [
      new webpack.DefinePlugin({ global: "globalThis", "process.env.SLF_LOG_LEVEL": JSON.stringify("DEBUG") }),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      new ModuleFederationPlugin({
        name: "basic_validation",
        filename: "remoteEntry.js",
        library: { type: target === "browser" ? "var" : "commonjs-module", name: "basic_validation" },
        exposes: { "./factory": resolve(output, "author/factory.js") },
        dts: false,
        manifest: false,
      }),
    ],
  });
  await new Promise<void>((accept, reject) => {
    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError || !stats || stats.hasErrors()) {
          reject(new FoundationError(stats?.toString({ all: false, errors: true }) ?? "MF compiler failed"));
        } else accept();
      });
    });
  });
}

async function inventory(target: "browser" | "bun") {
  const directory = resolve(output, target);
  const files = await readdir(directory);
  if (files.length !== 1 || files[0] !== "remoteEntry.js") throw new FoundationError("Expected one executable per target");
  const bytes = await readFile(resolve(directory, "remoteEntry.js"));
  return {
    target,
    expose: "./factory",
    file: `${target}/remoteEntry.js`,
    bytes: bytes.length,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  };
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const author = await Bun.build({
  entrypoints: [resolve(root, "tests/feasibility/plugins/basic-validation/factory.ts")],
  outdir: resolve(output, "author"),
  target: "browser",
  external: ["slf"],
  minify: false,
});
if (!author.success) throw new FoundationError("Author transpilation failed");
await compile("browser");
await compile("bun");
const artifacts = await Promise.all([inventory("browser"), inventory("bun")]);
await writeFile(resolve(output, "artifacts.json"), `${JSON.stringify(artifacts, null, 2)}\n`);
for (const host of ["browser", "cli", "web-server"]) {
  const result = await Bun.build({
    entrypoints: [resolve(root, `tests/feasibility/apps/${host}/main.ts`)],
    outdir: resolve(output, "hosts"),
    naming: `${host}.js`,
    target: host === "browser" ? "browser" : "bun",
    define: { global: "globalThis", "process.env.SLF_LOG_LEVEL": JSON.stringify("DEBUG") },
  });
  if (!result.success) throw new FoundationError(`Host build failed: ${host}`);
  const source = await readFile(resolve(output, `hosts/${host}.js`), "utf8");
  if (source.includes("remote evaluated") || source.includes("remote activated") || source.includes("tests/feasibility/plugins/basic-validation"))
    throw new FoundationError("Plugin leaked into host build");
}
console.log(JSON.stringify({ bun: Bun.version, webpack: webpack.version, artifacts }));
const graphs = await Promise.all(["browser", "cli", "web-server"].map(async (host) => ({ host, inputs: await hostGraph(root, host) })));
await writeFile(resolve(output, "build-inventory.json"), `${JSON.stringify({ executables: await executableInventory(output), graphs }, null, 2)}\n`);
