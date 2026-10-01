import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { plugins } from "../apps/shared/domain.js";
import { artifactClosure, compileArtifact } from "./demo-artifacts.js";
import { cleanDemo, demoGraph } from "./demo-graph.js";
import { FoundationError } from "./policy.js";

const root = resolve(import.meta.dir, "..");
const output = join(root, ".demo-build");
await cleanDemo(root);
await mkdir(output);
const artifacts = [];
for (const plugin of plugins) {
  const author = await Bun.build({
    entrypoints: [join(root, `plugins/${plugin}/src/factory.ts`)],
    outdir: join(output, "author", plugin),
    target: "browser",
    external: ["slf"],
  });
  if (!author.success) throw new FoundationError("demo-author-transpile-failed");
  for (const target of ["browser", "server"] satisfies readonly ("browser" | "server")[]) artifacts.push(await compileArtifact(output, plugin, target));
}
const graphs = [];
for (const host of ["browser", "web-server", "cli"]) {
  const result = await Bun.build({
    entrypoints: [join(root, `apps/${host}/main.ts`)],
    target: host === "browser" ? "browser" : "bun",
    outdir: join(output, "hosts"),
    naming: `${host === "web-server" ? "server" : host}.js`,
    define: { global: "globalThis", "process.env.SLF_LOG_LEVEL": JSON.stringify("DEBUG") },
  });
  if (!result.success) throw new FoundationError("demo-host-build-failed");
  const path = join(output, "hosts", `${host === "web-server" ? "server" : host}.js`);
  const source = await readFile(path, "utf8");
  if (source.includes("SECRET_ERROR_SENTINEL") || source.includes("plugins/basic-validation/src") || source.includes("plugins/reference-required/src"))
    throw new FoundationError("demo-plugin-bundled-in-host");
  graphs.push({ host, inputs: await demoGraph(root, `apps/${host}/main.ts`), bytes: (await readFile(path)).length });
}
await writeFile(join(output, "artifacts.json"), JSON.stringify(artifacts, null, 2));
await writeFile(join(output, "build-inventory.json"), JSON.stringify({ artifacts, executableFiles: await artifactClosure(output), graphs }, null, 2));
await writeFile(join(output, "index.html"), await readFile(join(root, "apps/browser/index.html")));
await writeFile(join(output, "styles.css"), await readFile(join(root, "apps/browser/styles.css")));
console.log(JSON.stringify({ artifacts, graphs }));
