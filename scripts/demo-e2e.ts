import { join } from "node:path";
import type { Host } from "@pylons/contracts";
import { startFixture } from "../apps/fixture-server/main.js";
import { balanced, check, get, logging } from "./demo-assert.js";
import { client } from "./demo-client.js";
import { demandAndReuse, discovery, keyboard, serverBypass } from "./demo-happy.js";
import { cleanup, expiry, failure, late, updates } from "./demo-risks.js";

const scenarios = ["happy", "update", "expiry", "network", "partial", "cleanup", "read", "load", "init"];
async function run(host: Host, scenario: string): Promise<void> {
  const fixture = await startFixture();
  const consumer = await client(host, fixture.origin);
  let closed = false;
  try {
    if (scenario === "happy") {
      await discovery(consumer, fixture);
      await demandAndReuse(consumer, fixture);
      await serverBypass(consumer, host);
      await keyboard(consumer);
    } else if (scenario === "update") await updates(consumer, fixture);
    else if (scenario === "expiry") await expiry(consumer, fixture);
    else if (scenario === "network" || scenario === "partial") await failure(consumer, fixture, host, scenario === "partial");
    else if (scenario === "cleanup") await cleanup(consumer, fixture);
    else if (scenario === "read" || scenario === "load" || scenario === "init") await late(consumer, fixture, host, scenario);
    await consumer.command({ op: "shutdown" });
    const proof = await consumer.command({ op: "report" });
    balanced(proof);
    check(get(proof, "timers") === 0 && get(proof, "rootsOwned") === get(proof, "rootsCleaned"), "owned-host-timers-listeners");
    logging(proof, scenario === "happy");
    const completion = await consumer.close(host === "cli" && scenario === "cleanup" ? 2 : 0);
    closed = true;
    console.log(JSON.stringify({ host, scenario, proof, transport: fixture.trace, startedRequests: fixture.requests, completion }));
  } finally {
    await fixture.stop();
    if (!closed) {
      await consumer.command({ op: "shutdown" });
      await consumer.close(host === "cli" && scenario === "cleanup" ? 2 : 0);
    }
  }
}
async function cliCodes(): Promise<void> {
  const fixture = await startFixture();
  try {
    for (const [token, name, expected] of [
      ["a-alice", "short", 0],
      ["b-alice", "short", 1],
      ["b-alice", "long", 0],
      ["a-alice", "empty", 1],
      ["unknown", "long", 2],
      ["a-alice", "missing", 2],
    ] satisfies readonly (readonly [string, string, number])[]) {
      const child = Bun.spawn(
        [process.execPath, join(process.cwd(), ".demo-build/hosts/cli.js"), fixture.origin, token, join(process.cwd(), `tests/demo/documents/${name}.json`)],
        { stdout: "pipe", stderr: "pipe", timeout: 5000 },
      );
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      check(code === expected && !stderr.includes("SENTINEL"), "CLI-actual-exit-contract");
      console.log(JSON.stringify({ cliOneShot: name, exit: code, stdout, transport: fixture.trace }));
    }
  } finally {
    await fixture.stop();
  }
}
for (const host of ["cli", "server", "browser"] satisfies readonly Host[]) for (const scenario of scenarios) await run(host, scenario);
await cliCodes();
console.log("D01-D09 actual browser/server/CLI matrix passed; one-shot CLI launches are NOT warm-cache reuse proof.");
