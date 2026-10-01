import type { Host } from "@pylons/contracts";
import type { startFixture } from "../apps/fixture-server/main.js";
import { check, count, events, get, list, validate } from "./demo-assert.js";
import type { Client } from "./demo-client.js";

type Fixture = Awaited<ReturnType<typeof startFixture>>;
export async function discovery(client: Client, fixture: Fixture): Promise<void> {
  for (const scope of ["a", "b"]) {
    const result = await client.command({ op: "discover", tenant: scope });
    check(get(get(result, "result"), "success") === true, "D01-refresh");
    check(list(get(result, "metadata")).length === (scope === "a" ? 1 : 2), "D01-distinct-metadata");
    check(
      list(get(result, "catalog")).every((entry) => entry === true),
      "D01-public-catalog",
    );
  }
  check(count(await client.command({ op: "report" }), "evaluation") === 0, "D01-zero-evaluation");
  check(count(await client.command({ op: "report" }), "activation") === 0, "D01-zero-activation");
  check(!fixture.trace.some((entry) => entry.path.startsWith("artifacts/")), "D01-zero-executable");
  check(get(await client.command({ op: "security", ready: false }), "success") === false, "D05-startup-fail");
  await validate(client, "a-alice", "four", 2);
  check(get(await client.command({ op: "security", ready: true }), "success") === true, "D05-startup-ready");
}
export async function demandAndReuse(client: Client, fixture: Fixture): Promise<void> {
  const pair = await client.command({ op: "pair", tenant: "a" });
  const results = list(get(pair, "results"));
  check(get(results[0], "success") === false && get(get(results[0], "error"), "code") === "cancelled" && get(results[1], "success") === true, "D03-survivor");
  check(get(pair, "subscriptions") === 0, "D03-caller-cleanup");
  await validate(client, "b-alice", "four", 1, undefined, true);
  check(!fixture.trace.some((entry) => entry.path.includes("reference-required/")), "D02-B-base-only-no-reference");
  await validate(client, "a-alice", "four", 0);
  await validate(client, "b-alice", "four", 1);
  for (const token of ["a-alice", "b-alice"]) {
    await validate(client, token, "A long document title", 0, "REF-1");
    await validate(client, token, "", 1);
  }
  await validate(client, "a-alice", "A long document title", 0);
  await validate(client, "b-alice", "A long document title", 1);
  await Promise.all([
    validate(client, "a-bob", "four", 0),
    validate(client, "b-bob", "A long document title", 0, "REF-1"),
    validate(client, "a-alice", "four", 0),
  ]);
  await validate(client, "a-alice", "SECRET_DOCUMENT_SENTINEL", 0);
  const report = await client.command({ op: "report" });
  check(requiredReady(report, "basic-validation", "ready") < requiredReady(report, "reference-required", "loading"), "D02-required-readiness-order");
  check(
    count(report, "activation", "basic-validation", "a") === 1 &&
      count(report, "activation", "basic-validation", "b") === 1 &&
      count(report, "activation", "reference-required", "b") === 1,
    "D02-D03-scoped-singleflight",
  );
  const calls = events(report).filter((event) => event.kind === "invocation");
  check(calls.length > 8 && calls.every((event) => event.requestMatches === true), "D04-request-local-credentials");
  check(new Set(calls.map((event) => event.transaction)).size === calls.length, "D04-request-local-transactions");
  check(calls.some((event) => event.subject === "a-bob") && calls.some((event) => event.subject === "b-bob"), "D04-user-change");
  check(fixture.trace.filter((entry) => entry.path.startsWith("artifacts/")).length === 2, "D02-cold-exact-downloads");
  const wrong = await client.command({ op: "invoke", tenant: "a", token: "b-alice", document: { title: "long enough" } });
  check(get(get(wrong, "error"), "code") === "denied", "D05-guarded-wrong-tenant");
  const before = count(report, "invocation");
  await client.command({ op: "security", ready: false });
  await validate(client, "b-alice", "long enough", 2, "REF-1");
  check(count(await client.command({ op: "report" }), "invocation") === before, "D05-false-ready-false");
  await client.command({ op: "security", ready: true });
}
function requiredReady(report: unknown, plugin: string, state: string): number {
  const index = list(get(report, "events")).findIndex((record) => {
    const event = get(record, "event");
    const snapshot = get(event, "snapshot");
    const generation = get(snapshot, "generation");
    return (
      get(event, "kind") === "state-changed" &&
      get(snapshot, "state") === state &&
      get(get(generation, "scope"), "tenantId") === "b" &&
      get(get(generation, "definition"), "pluginId") === plugin
    );
  });
  check(index >= 0, "D02-required-state-present");
  return index;
}
export async function serverBypass(client: Client, host: Host): Promise<void> {
  if (host !== "server" || !client.url) return;
  for (const [token, query, expected] of [
    ["SECRET_HEADER_SENTINEL", "", 401],
    ["a-alice", "?tenant=b", 403],
    ["b-alice", "", 422],
  ] satisfies readonly (readonly [string, string, number])[]) {
    const response = await fetch(new URL(`validate${query}`, client.url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "four" }),
    });
    check(response.status === expected && !(await response.text()).includes("SENTINEL"), "D05-authoritative-server-bypass");
  }
  const fixture = await fetch(new URL("fixture-validate?name=long", client.url), { headers: { authorization: "Bearer b-alice" } });
  check(fixture.status === 200, "D02-server-reads-document-fixture");
  for (const header of ["", "Bearer a-alice"]) {
    const response = await fetch(new URL("metadata?tenant=b", client.url), { headers: { authorization: header } });
    check(response.status === (header ? 403 : 401), "D05-no-foreign-metadata");
  }
}
export async function keyboard(client: Client): Promise<void> {
  const page = client.page;
  if (!page) return;
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator("#tenant").focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await page.keyboard.type("four");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("status")?.textContent === "Valid");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "keyboard-responsive-width");
    await page.locator("#title").focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
  }
  await page.getByRole("button", { name: "Load long document fixture" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>("#title")?.value === "A long document title");
  await page.locator("#tenant").focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Validate locally" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("status")?.textContent === "Valid");
}
