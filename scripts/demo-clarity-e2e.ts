import type { Page } from "playwright-core";
import { startFixture } from "../apps/fixture-server/main.js";
import { check, count, get, snapshots, waitFor } from "./demo-assert.js";
import { type Client, client } from "./demo-client.js";

type Fixture = Awaited<ReturnType<typeof startFixture>>;

async function matchesReport(page: Page, consumer: Client, scope: string): Promise<void> {
  const entries = snapshots(await consumer.command({ op: "report" }), scope);
  const cards = page.locator("#lifecycle article");
  check((await cards.count()) === entries.length, "clarity-all-retained-generations");
  for (const [index, entry] of entries.entries()) {
    const generation = get(entry, "generation");
    const definition = get(generation, "definition");
    const card = cards.nth(index);
    check((await card.getAttribute("data-plugin")) === get(definition, "pluginId"), "clarity-plugin-identity");
    check((await card.getAttribute("data-state")) === entry.state, "clarity-actual-state");
    const values = await card.locator("dd").allTextContents();
    check(
      JSON.stringify(values) ===
        JSON.stringify([
          get(definition, "definitionVersion"),
          entry.extensionId ?? "not available",
          get(generation, "generationId"),
          get(generation, "desiredRevision"),
          get(generation, "appliedRevision") ?? "not applied",
          get(get(generation, "scope"), "hostId"),
          get(get(generation, "scope"), "tenantId"),
        ]),
      "clarity-exact-context-revisions",
    );
  }
}

async function initial(page: Page, consumer: Client, fixture: Fixture): Promise<void> {
  await matchesReport(page, consumer, "a");
  const titles = await page.locator("#lifecycle h4").allTextContents();
  check(titles.join() === "basic-validation · blocked", "clarity-initial-A");
  check((await page.locator("#lifecycle").textContent())?.includes("validation@1"), "clarity-real-contribution-label");
  await page.locator("#tenant").selectOption("b");
  await matchesReport(page, consumer, "b");
  check((await page.locator("#lifecycle article").count()) === 2, "clarity-selected-B-two-plugins");
  check((await page.locator("#lifecycle").textContent())?.includes("reference-validation@1"), "clarity-B-contribution-label");
  const proof = await consumer.command({ op: "report" });
  check(count(proof, "evaluation") === 0 && count(proof, "activation") === 0, "clarity-metadata-before-execution");
  check(!fixture.requests.some((path) => path.startsWith("artifacts/")), "clarity-zero-executable-requests");
  check((await page.locator("#lifecycle [aria-live], #lifecycle [role=status]").count()) === 0, "clarity-no-live-card-spam");
}

async function transitions(page: Page, consumer: Client, fixture: Fixture): Promise<void> {
  await page.locator("#tenant").selectOption("a");
  fixture.scopes.a.values["basic-validation"].initMode = "hold";
  await consumer.command({ op: "refresh", tenant: "a" });
  const artifact = "artifacts/basic-validation/browser.js";
  const init = "init/basic-validation/a";
  fixture.hold(artifact);
  fixture.hold(init);
  const pending = consumer.command({ op: "validate", token: "a-alice", document: { title: "four" } });
  await waitFor(() => fixture.requests.includes(artifact));
  await page.waitForSelector('#lifecycle article[data-state="loading"]');
  await matchesReport(page, consumer, "a");
  fixture.release(artifact);
  await waitFor(() => fixture.requests.includes(init));
  await page.waitForSelector('#lifecycle article[data-state="activating"]');
  await matchesReport(page, consumer, "a");
  fixture.release(init);
  check(get(await pending, "code") === 0, "clarity-demand-valid");
  await page.waitForSelector('#lifecycle article[data-state="ready"]');
  await matchesReport(page, consumer, "a");
  await consumer.command({ op: "validate", token: "a-bob", document: { title: "four" } });
  check(count(await consumer.command({ op: "report" }), "activation", "basic-validation", "a") === 1, "clarity-warm-no-reactivation");
}

async function revisions(page: Page, consumer: Client, fixture: Fixture): Promise<void> {
  fixture.scopes.a.revision = "r2";
  await consumer.command({ op: "refresh", tenant: "a" });
  await matchesReport(page, consumer, "a");
  await page.locator("#tenant").selectOption("b");
  await consumer.command({ op: "validate", token: "b-bob", document: { title: "A long document title", reference: "REF-1" } });
  fixture.scopes.b.revision = "r2";
  await consumer.command({ op: "refresh", tenant: "b" });
  await page.waitForSelector('#lifecycle article[data-state="restart-required"]');
  await matchesReport(page, consumer, "b");
  fixture.scopes.b.version = "2";
  fixture.scopes.b.revision = "v2";
  await consumer.command({ op: "refresh", tenant: "b" });
  await consumer.command({ op: "validate", token: "b-alice", document: { title: "A long document title", reference: "REF-1" } });
  await matchesReport(page, consumer, "b");
  check((await page.locator("#lifecycle article").count()) > 2, "clarity-history-not-collapsed");
}

async function keyboard(page: Page): Promise<void> {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator("#tenant").focus();
    await page.keyboard.press("Home");
    check((await page.locator("#lifecycle h3").textContent())?.includes("Tenant A"), "clarity-keyboard-A");
    await page.keyboard.press("End");
    check((await page.locator("#lifecycle h3").textContent())?.includes("Tenant B"), "clarity-keyboard-B");
    await page.locator("#lifecycle summary").first().focus();
    await page.keyboard.press("Enter");
    check((await page.locator("#lifecycle details").first().getAttribute("open")) !== null, "clarity-keyboard-details");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "clarity-responsive-width");
    await page.keyboard.press("Enter");
  }
}

async function failed(page: Page, consumer: Client, fixture: Fixture): Promise<void> {
  fixture.fail("artifacts/reference-required/browser.js");
  await page.locator("#tenant").selectOption("b");
  check(
    get(await consumer.command({ op: "validate", token: "b-alice", document: { title: "A long document title", reference: "REF-1" } }), "code") === 2,
    "clarity-real-load-failure",
  );
  await page.waitForSelector('#lifecycle article[data-state="failed"]');
  await matchesReport(page, consumer, "b");
  const text = await page.locator("#lifecycle").textContent();
  check(text?.includes("Failure code: load-failed") && !text.includes("SENTINEL"), "clarity-safe-failure-code-only");
}

async function run(failure: boolean): Promise<void> {
  const fixture = await startFixture();
  const consumer = await client("browser", fixture.origin);
  const page = consumer.page;
  check(page, "clarity-compiled-Chromium");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await initial(page, consumer, fixture);
    if (failure) await failed(page, consumer, fixture);
    else {
      await transitions(page, consumer, fixture);
      await revisions(page, consumer, fixture);
      await keyboard(page);
    }
    const before = await page.locator("#lifecycle").textContent();
    await consumer.command({ op: "shutdown" });
    await page.locator("#tenant").selectOption("a");
    check((await page.locator("#lifecycle").textContent()) === before, "clarity-no-post-shutdown-tenant-write");
    check(errors.length === 0, "clarity-no-page-errors");
  } finally {
    await consumer.command({ op: "shutdown" });
    await fixture.stop();
    await consumer.close();
  }
}

await run(false);
await run(true);
console.log(
  "Compiled browser clarity: selected tenants, metadata, loading/activating/ready, warm revisions, restart/history, safe failure, keyboard/responsive and closed guards passed.",
);
