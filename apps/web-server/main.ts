import debug from "debug";
import { activate } from "../../tests/feasibility/activation.js";
import { bunLoader } from "../../tests/feasibility/loader-bun.js";
import { bindLogging } from "../../tests/feasibility/logging-bootstrap.js";
import { readMetadata } from "../../tests/feasibility/metadata.js";
import { HttpBoundary, httpFailure, observeHttpFailure } from "./http-boundary.js";

debug.enable("pylons:*");
bindLogging();
async function main(): Promise<void> {
  const origin = process.argv[2];
  if (!origin) throw new Error("arguments-invalid");
  const metadata = await readMetadata(origin, "server");
  const boundary = new HttpBoundary(
    { contributions: metadata.request.definition.contributions, selected: metadata.request.extension.id },
    () => activate(origin, "server", bunLoader(origin)),
    () => {
      setTimeout(() => {
        server.stop(true).catch(() => observeHttpFailure("shutdown-failed"));
      }, 10);
    },
  );
  const server = Bun.serve({ port: 0, fetch: (request) => boundary.fetch(request), error: () => httpFailure("request-failed") });
  console.log(JSON.stringify({ url: server.url.href }));
}

try { await main(); }
catch {
  observeHttpFailure("activation-failed");
  process.exitCode = 2;
}
