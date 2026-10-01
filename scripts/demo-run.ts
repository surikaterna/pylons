import { startFixture } from "../apps/fixture-server/main.js";
import { check, get } from "./demo-assert.js";
import { type ServerClient, serverClient } from "./demo-server.js";

const fixture = await startFixture(process.argv.includes("--smoke") ? 0 : 4040, 60000);
let server: ServerClient | undefined;
async function waitForStop(): Promise<void> {
  let stop = () => {};
  try {
    await new Promise<void>((resolve) => {
      stop = resolve;
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
async function closeServer(server: ServerClient): Promise<void> {
  let stopped: unknown;
  let completion: unknown;
  try {
    stopped = await server.command({ op: "shutdown" });
  } finally {
    completion = await server.close();
  }
  console.log(JSON.stringify({ stopped, completion }));
}
try {
  server = await serverClient(fixture.origin, { kind: "interactive" });
  await server.command({ op: "discover", tenant: "a" });
  await server.command({ op: "discover", tenant: "b" });
  await server.command({ op: "security", ready: true });
  console.log(
    JSON.stringify({ browser: new URL("browser", fixture.origin).href, server: server.url, cliOrigin: fixture.origin, finiteGrantMilliseconds: 60000 }),
  );
  if (process.argv.includes("--smoke")) {
    check(get(await server.command({ op: "validate", token: "a-alice", document: { title: "four" } }), "code") === 0, "smoke-A");
    check(get(await server.command({ op: "validate", token: "b-alice", document: { title: "four" } }), "code") === 1, "smoke-B");
  } else await waitForStop();
} finally {
  try {
    if (server) await closeServer(server);
  } finally {
    await fixture.stop();
  }
}
