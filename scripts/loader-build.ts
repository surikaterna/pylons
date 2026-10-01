import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/webpack";
import webpack from "webpack";
import { capture } from "./pack-check.js";
import { FoundationError } from "./policy.js";

const root = process.cwd();
const output = join(root, ".loader-build");

async function artifact(target: "browser" | "server", fanout = false) {
  const compiler = webpack({
    mode: "development",
    devtool: false,
    target: target === "browser" ? "web" : "node",
    entry: {},
    output: {
      path: join(output, fanout ? `${target}-fanout` : target),
      publicPath: "",
      library: { type: target === "browser" ? "var" : "commonjs-module", name: "loader_fixture" },
    },
    plugins: [
      ...(!fanout ? [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })] : []),
      new ModuleFederationPlugin({
        name: "loader_fixture",
        filename: "remoteEntry.js",
        library: { type: target === "browser" ? "var" : "commonjs-module", name: "loader_fixture" },
        exposes: { "./factory": join(output, "author/remote-factory.js") },
        dts: false,
        manifest: false,
      }),
    ],
  });
  await new Promise<void>((resolve, reject) => {
    compiler.run((error, stats) =>
      compiler.close((closed) => {
        if (error || closed || !stats || stats.hasErrors()) reject(new FoundationError("loader-artifact-build-failed"));
        else resolve();
      }),
    );
  });
  const files = await readdir(join(output, fanout ? `${target}-fanout` : target));
  if (fanout ? files.length <= 1 : files.length !== 1 || files[0] !== "remoteEntry.js") throw new FoundationError("unsupported-executable-profile");
  console.log(JSON.stringify({ target, fanout, executableFiles: files }));
}

await rm(join(root, "packages/loader-mf/dist"), { recursive: true, force: true });
capture([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--project", "packages/loader-mf/tsconfig.build.json"], root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
const author = await Bun.build({ entrypoints: [join(root, "tests/loader/remote-factory.ts")], outdir: join(output, "author"), target: "browser" });
if (!author.success) throw new FoundationError("loader-author-build-failed");
await artifact("browser");
await artifact("server");
await artifact("browser", true);
await artifact("server", true);
for (const target of ["browser", "bun"] satisfies readonly ("browser" | "bun")[]) {
  const result = await Bun.build({ entrypoints: [join(root, `scripts/loader-${target}-host.ts`)], target, outdir: join(output, "hosts") });
  if (!result.success) throw new FoundationError("loader-host-build-failed");
  const packed = await Bun.build({
    entrypoints: [join(root, `scripts/loader-${target}-host.ts`)],
    target,
    outdir: join(output, "packed-hosts"),
    external: ["@pylons/loader-mf/server", "@pylons/loader-mf/browser", "@pylons/contracts"],
  });
  if (!packed.success) throw new FoundationError("loader-packed-host-build-failed");
  const source = await readFile(join(output, `hosts/loader-${target}-host.js`), "utf8");
  if (source.includes("remote-factory.ts") || source.includes("metrics.activated++") || source.includes("title.length >= minimum"))
    throw new FoundationError("plugin-leaked-into-host");
}
console.log("Loader: independently built single-script MF containers and public-adapter host consumers.");
