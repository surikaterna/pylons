import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/webpack";
import webpack from "webpack";
import type { Plugin } from "../apps/shared/domain.js";
import { FoundationError } from "./policy.js";

export async function compileArtifact(output: string, plugin: Plugin, target: "browser" | "server") {
  const name = `demo_${plugin.replaceAll("-", "_")}`;
  const compiler = webpack({
    mode: "development",
    devtool: false,
    target: target === "browser" ? "web" : "node",
    entry: {},
    output: {
      path: join(output, "artifacts", plugin),
      filename: `${target}.js`,
      publicPath: "",
      library: { type: target === "browser" ? "var" : "commonjs-module", name },
    },
    plugins: [
      new webpack.DefinePlugin({ global: "globalThis", "process.env.SLF_LOG_LEVEL": JSON.stringify("DEBUG") }),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      new ModuleFederationPlugin({
        name,
        filename: `${target}.js`,
        library: { type: target === "browser" ? "var" : "commonjs-module", name },
        exposes: { "./factory": join(output, "author", plugin, "factory.js") },
        dts: false,
        manifest: false,
      }),
    ],
  });
  await new Promise<void>((accept, reject) => {
    compiler.run((error, stats) =>
      compiler.close((closed) => {
        if (error || closed || !stats || stats.hasErrors()) reject(new FoundationError("demo-artifact-build-failed"));
        else accept();
      }),
    );
  });
  const file = `artifacts/${plugin}/${target}.js`;
  const bytes = await readFile(join(output, file));
  return { plugin, target, file, bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
}
export async function artifactClosure(output: string) {
  const files = (await readdir(join(output, "artifacts"), { recursive: true })).filter((file) => file.endsWith(".js")).sort();
  const expected = ["basic-validation/browser.js", "basic-validation/server.js", "reference-required/browser.js", "reference-required/server.js"].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new FoundationError("demo-executable-profile-failed");
  return files;
}
