import { join } from "node:path";
import { chromium } from "playwright-core";
import { startFixture } from "../apps/fixture-server/main.js";
import { check, get, list } from "./demo-assert.js";
import { client } from "./demo-client.js";

async function expiredCli(): Promise<void> {
  const fixture = await startFixture();
  fixture.scopes.a.until = Date.now() - 1;
  try {
    const child = Bun.spawn([process.execPath, ".demo-build/hosts/cli.js", "--diagnostics", fixture.origin, "a-alice", "tests/demo/documents/long.json"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    check(exit === 2 && stdout.trim() === '{"code":2,"error":"discovery-failed"}', "diagnostics-expired-CLI-phase-contract");
    check(
      stderr.includes("invalid-plan") && stderr.includes("Restart the demo fixture") && stderr.includes("No plugin snapshots"),
      "diagnostics-actionable-source-failure",
    );
    check(!stderr.includes("demo plan-invalid c0") && !(stdout + stderr).includes("SENTINEL"), "diagnostics-no-synthetic-warning-or-payload");
    check(!fixture.requests.some((path) => path.startsWith("artifacts/")), "diagnostics-expired-no-executable-request");
    console.log(JSON.stringify({ expiredCli: { exit, stdout, stderr, requests: fixture.requests } }));
  } finally {
    await fixture.stop();
  }
}

async function normalCli(): Promise<void> {
  const fixture = await startFixture();
  try {
    for (const [token, name, expected] of [
      ["a-alice", "short", 0],
      ["b-alice", "short", 1],
      ["b-bob", "long", 0],
    ] satisfies readonly (readonly [string, string, number])[]) {
      const child = Bun.spawn(
        [process.execPath, ".demo-build/hosts/cli.js", fixture.origin, token, join("tests/demo/documents", `${name}.json`), "--diagnostics"],
        { stdout: "pipe", stderr: "pipe", timeout: 5000 },
      );
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      check(exit === expected && stdout.trim() === JSON.stringify({ code: expected }), "diagnostics-normal-stdout-contract");
      check(
        stderr.includes("before shutdown") && stderr.includes("after shutdown") && stderr.includes("state-changed") && stderr.includes("stopped"),
        "diagnostics-actual-CLI-lifecycle",
      );
      check(!stderr.includes("demo plan-invalid c0") && !(stdout + stderr).includes("SENTINEL"), "diagnostics-normal-safe-output");
    }
    await warmCli(fixture);
  } finally {
    await fixture.stop();
  }
}

async function warmCli(fixture: Awaited<ReturnType<typeof startFixture>>): Promise<void> {
  const consumer = await client("cli", fixture.origin);
  try {
    await consumer.command({ op: "discover", tenant: "a" });
    await consumer.command({ op: "security", ready: true });
    await consumer.command({ op: "validate", token: "a-alice", document: { title: "four" } });
    await consumer.command({ op: "validate", token: "a-bob", document: { title: "four" } });
    fixture.scopes.a.until = Date.now() - 1;
    await consumer.command({ op: "refresh", tenant: "a" });
    const view = await consumer.command({ op: "diagnostics" });
    check(
      list(get(view, "sources")).some((entry) => get(entry, "code") === "invalid-plan"),
      "diagnostics-warm-then-source-expired",
    );
    check(!JSON.stringify(view).includes("SENTINEL"), "diagnostics-session-safe-projection");
  } finally {
    await consumer.command({ op: "shutdown" });
    await consumer.close();
  }
}

async function expiredBrowser(): Promise<void> {
  const fixture = await startFixture();
  fixture.scopes.a.until = fixture.scopes.b.until = Date.now() - 1;
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(new URL("browser", fixture.origin).href);
    await page.waitForFunction(() => document.getElementById("lifecycle")?.textContent?.includes("invalid-plan"));
    const text = await page.locator("#lifecycle").textContent();
    check(text?.includes("Restart the demo fixture") && text.includes("A plan:") && text.includes("B plan:"), "diagnostics-browser-source-both-scopes");
    check((await page.locator("#lifecycle article").count()) === 0, "diagnostics-failed-discovery-no-invented-state");
    check(!text?.includes("SENTINEL") && !fixture.requests.some((path) => path.startsWith("artifacts/")), "diagnostics-browser-failure-safe-no-code");
    await page.locator("#lifecycle-filter").selectOption("selected");
    check(!(await page.locator("#lifecycle").textContent())?.includes("B plan:"), "diagnostics-source-filter-selected");
    await page.locator("#shutdown").click();
    const before = await page.locator("#lifecycle").textContent();
    await page.locator("#lifecycle-filter").selectOption("all");
    check((await page.locator("#lifecycle").textContent()) === before, "diagnostics-filter-owned-disposal");
  } finally {
    await browser.close();
    await fixture.stop();
  }
}

await expiredCli();
await normalCli();
await expiredBrowser();
console.log("Compiled diagnostics: expired discovery before demand/no artifact, real CLI 0/1/2, warm expiry, browser empty failure and owned filter passed.");
