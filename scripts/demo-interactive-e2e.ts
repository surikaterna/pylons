import { balanced, check, get } from "./demo-assert.js";

const executable = process.execPath;

async function line(reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>): Promise<unknown> {
  let text = "";
  while (!text.includes("\n")) {
    const value = await reader.read();
    check(!value.done, "managed-startup-output");
    text += new TextDecoder().decode(value.value);
  }
  return JSON.parse(text.slice(0, text.indexOf("\n")));
}
async function remainder(reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>): Promise<string> {
  let text = "";
  while (true) {
    const value = await reader.read();
    if (value.done) return text;
    text += new TextDecoder().decode(value.value);
  }
}
async function unreachable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return false;
  } catch {
    return true;
  }
}
async function interactive(): Promise<void> {
  const process = Bun.spawn([executable, "scripts/demo-run.ts"], { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  const errors = new Response(process.stderr).text();
  const reader = process.stdout.getReader();
  try {
    const ready = await line(reader);
    const url = get(ready, "server");
    const browser = get(ready, "browser");
    check(typeof url === "string" && typeof browser === "string", "managed-ready-URLs");
    const metadata = () => fetch(new URL("metadata", url), { headers: { authorization: "Bearer a-alice" } });
    check((await metadata()).status === 200, "managed-initial-alive");
    await Bun.sleep(12500);
    check((await metadata()).status === 200, "managed-alive-beyond-test-deadline");
    for (const token of ["a-alice", "b-alice"]) {
      const response = await fetch(new URL("validate", url), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "A long document title", reference: "REF-1" }),
      });
      check(response.status === 200, "managed-valid-after-12s");
    }
    process.kill("SIGINT");
    const final = JSON.parse((await remainder(reader)).trim());
    const report = get(get(final, "stopped"), "report");
    balanced(report);
    check(get(report, "timers") === 0 && get(report, "closing") === true, "managed-cleanup");
    const exit = await process.exited;
    check(exit === 0 && process.signalCode === null && !(await errors).includes("SENTINEL"), "managed-natural-exit");
    check((await unreachable(url)) && (await unreachable(browser)), "managed-transports-closed");
    console.log(JSON.stringify({ interactive: true, aliveAfterMilliseconds: 12500, explicitStop: "SIGINT", exit, signal: process.signalCode, stopped: final }));
  } finally {
    reader.releaseLock();
    if (process.exitCode === null) process.kill("SIGINT");
    await process.exited;
  }
}
async function smoke(): Promise<void> {
  const process = Bun.spawn([executable, "scripts/demo-run.ts", "--smoke"], { stdout: "pipe", stderr: "pipe", timeout: 5000 });
  const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  check(exit === 0 && process.signalCode === null && !stderr.includes("SENTINEL"), "managed-bounded-smoke");
  console.log(JSON.stringify({ smoke: true, externalTestBoundMilliseconds: 5000, exit, stdout }));
}
await interactive();
await smoke();
