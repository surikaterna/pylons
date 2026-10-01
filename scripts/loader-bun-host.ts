import { createServerLoader } from "@pylons/loader-mf/server";
import { competing } from "./loader-competing.js";
import { metrics } from "./loader-exercise.js";
import { settings } from "./loader-host-options.js";

async function run() {
  const origin = process.argv[2];
  const host = process.argv[3];
  if (!origin || (host !== "server" && host !== "cli")) throw new Error("invalid-host");
  const data = await settings(origin, host);
  const actual = createServerLoader(data.options);
  if (host === "cli") return competing(actual, data.options, data.request, data.scenario, createServerLoader);
  const owned = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      return Response.json(await competing(actual, data.options, data.request, data.scenario, createServerLoader));
    },
    error() {
      return Response.json({ code: "host-failed" }, { status: 503 });
    },
  });
  try {
    return await (await fetch(owned.url)).json();
  } finally {
    owned.stop(true);
  }
}
try {
  console.log(JSON.stringify({ proof: await run(), metrics: metrics() }));
} catch {
  console.log(JSON.stringify({ proof: { code: "host-failed" }, metrics: metrics() }));
  process.exitCode = 2;
}
