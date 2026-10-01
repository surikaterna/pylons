import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { FoundationError } from "./policy.js";

const fixture = `
import { createHttpPlanSource } from '@pylons/source-http';
import { createFetchTransport } from '@pylons/source-http/fetch';
const context = { scope: { hostId: 'host', tenantId: 'tenant' }, authorizationId: 'grant' };
const source = createHttpPlanSource({
  transport: createFetchTransport(), maxResponseBytes: 4096, timeoutMilliseconds: 2000,
  clock: { now: () => 1000, schedule: (delay, callback) => { const timer = setTimeout(callback, delay); return { dispose: () => clearTimeout(timer) }; } },
  resolveEndpoint: () => ({ url: location.origin + '/metadata', headers: {} }),
  authorization: { async authorize(_request, endpoint) {
    if (new URL(endpoint.url).origin !== location.origin) return { success: false, error: { code: 'unauthorized' } };
    return { success: true, data: { sourceId: 'fixture', authorizedUntil: 2000, maxFreshnessMilliseconds: 1000 } };
  } },
});
const result = await source.read(context, { cancelled: false, onCancel: () => ({ dispose() {} }) });
document.getElementById('result').textContent = result.success ? 'passed' : 'failed';
`;

export async function sourceBrowserConsumer(cwd: string): Promise<void> {
  await writeFile(join(cwd, "browser.js"), fixture);
  const build = await Bun.build({ entrypoints: [join(cwd, "browser.js")], target: "browser", outdir: join(cwd, "browser-build") });
  if (!build.success) throw new FoundationError("Packed browser source consumer build failed");
  const script = await readFile(join(cwd, "browser-build/browser.js"));
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/browser.js") return new Response(script, { headers: { "content-type": "text/javascript" } });
      if (path === "/metadata") {
        requests++;
        return Response.json({
          schemaVersion: 1,
          inventory: {
            schemaVersion: 1,
            scope: { hostId: "host", tenantId: "tenant" },
            revision: "r",
            validity: { freshUntil: 1500, authorizedUntil: 1500 },
            installations: [],
          },
          definitions: [],
          configs: [],
          provenance: { sourceId: "fixture", revision: "r", authorizationId: "grant" },
        });
      }
      return new Response('<div id="result">Loading</div><script type="module" src="/browser.js"></script>', { headers: { "content-type": "text/html" } });
    },
  });
  try {
    await verifyBrowser(server.url.href);
  } finally {
    server.stop(true);
  }
  if (requests !== 1) throw new FoundationError("Packed browser metadata request count mismatch");
}

async function verifyBrowser(url: string): Promise<void> {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"], timeout: 15_000 });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("result")?.textContent !== "Loading", undefined, { timeout: 5000 });
    if ((await page.locator("#result").innerText()) !== "passed") throw new FoundationError("Packed browser actual HTTP source failed");
    console.log(`Packed browser actual HTTP source passed; Chromium ${browser.version()}; metadata only`);
  } finally {
    await browser.close();
  }
}
