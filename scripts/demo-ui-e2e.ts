import type { Page } from "playwright-core";
import { startFixture } from "../apps/fixture-server/main.js";
import { check, waitFor } from "./demo-assert.js";
import { type Client, client } from "./demo-client.js";

async function fields(page: Page) {
  return page.evaluate(() => ({
    title: document.querySelector<HTMLInputElement>("#title")?.value,
    reference: document.querySelector<HTMLInputElement>("#reference")?.value,
    status: document.getElementById("status")?.textContent,
    lifecycle: document.getElementById("lifecycle")?.textContent,
  }));
}
async function ignoreCancellation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const native = globalThis.fetch.bind(globalThis);
    Reflect.set(globalThis, "fetch", (input: RequestInfo | URL) => native(input));
  });
}
async function failure(page: Page, mode: string): Promise<void> {
  await page.route("**/documents/long", async (route) => {
    if (mode === "network") {
      await route.abort("connectionfailed");
      return;
    }
    const body =
      mode === "json"
        ? "{SECRET_DOCUMENT_SENTINEL"
        : mode === "shape"
          ? JSON.stringify({ title: {}, reference: "SECRET_CONFIG_SENTINEL" })
          : "SECRET_ERROR_SENTINEL";
    await route.fulfill({ status: mode === "http" ? 503 : 200, contentType: "application/json", body });
  });
  await page.locator("#load-fixture").click();
  await page.waitForTimeout(150);
  const final = await fields(page);
  console.log(JSON.stringify({ uiCase: mode, final }));
  check(final.status === "Document fixture unavailable.", "R1-safe-fixed-status");
  check(final.title === "" && final.reference === "", "R1-no-malformed-document-publication");
}
async function shutdown(page: Page, consumer: Client, fixture: Awaited<ReturnType<typeof startFixture>>, noncooperative: boolean): Promise<void> {
  if (noncooperative) await ignoreCancellation(page);
  let aborted = 0;
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/documents/long")) aborted++;
  });
  fixture.hold("documents/long");
  await page.locator("#load-fixture").click();
  await waitFor(() => fixture.requests.includes("documents/long"));
  await consumer.command({ op: "shutdown" });
  const before = await fields(page);
  fixture.release("documents/long");
  await page.waitForTimeout(150);
  const after = await fields(page);
  console.log(JSON.stringify({ uiCase: noncooperative ? "shutdown-guard" : "shutdown-abort", before, after, aborted }));
  check(JSON.stringify(after) === JSON.stringify(before), "R2-no-post-shutdown-DOM-write");
  if (!noncooperative) check(aborted === 1, "R2-owned-fetch-aborted");
}
async function superseded(page: Page): Promise<void> {
  await ignoreCancellation(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/documents/long", async (route) => {
    const first = ++requests === 1;
    if (first) await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ title: first ? "old fixture" : "new fixture", reference: "REF-1" }),
    });
  });
  await page.locator("#load-fixture").click();
  await waitFor(() => requests === 1);
  await page.locator("#load-fixture").click();
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>("#title")?.value === "new fixture");
  const before = await fields(page);
  release();
  await page.waitForTimeout(150);
  const after = await fields(page);
  console.log(JSON.stringify({ uiCase: "superseded", before, after, requests }));
  check(JSON.stringify(after) === JSON.stringify(before) && requests === 2, "R2-no-superseded-DOM-write");
}
async function run(mode: string): Promise<void> {
  const fixture = await startFixture();
  const consumer = await client("browser", fixture.origin);
  const page = consumer.page;
  check(page, "compiled-browser-present");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    if (["network", "http", "json", "shape"].includes(mode)) await failure(page, mode);
    else if (mode === "superseded") await superseded(page);
    else await shutdown(page, consumer, fixture, mode === "shutdown-guard");
    check(errors.length === 0, "R1-R2-no-unhandled-browser-rejections");
  } finally {
    await fixture.stop();
    await consumer.command({ op: "shutdown" });
    await consumer.close();
  }
}
for (const mode of ["network", "http", "json", "shape", "shutdown-abort", "shutdown-guard", "superseded"]) {
  if (!process.argv[2] || process.argv[2] === mode) await run(mode);
}
console.log("Compiled browser R1/R2 failure/lifetime regressions passed.");
