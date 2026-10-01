import { serverHost } from "../shared/bootstrap-server.js";
import { bindLogging } from "../shared/logging.js";
import { handle } from "./http.js";

async function main(): Promise<void> {
  bindLogging();
  const origin = process.argv[2];
  if (!origin) throw new Error("input-failed");
  const host = await serverHost(origin, "server");
  host.policy.initialize(true);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.argv[3] ?? 0),
    fetch: (request) =>
      handle(host, request, () => {
        setTimeout(() => {
          void server.stop(true);
        }, 10);
      }),
    error: () => Response.json({ error: "request-failed" }, { status: 503 }),
  });
  console.log(JSON.stringify({ url: server.url.href }));
}
try {
  await main();
} catch {
  console.error("demo-infrastructure-failed");
  process.exitCode = 2;
}
