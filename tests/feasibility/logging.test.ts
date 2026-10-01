import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("fresh actual facade/backend characterize bootstrap, queue, threshold, namespaces and quirks", async () => {
  const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "logging-probe.ts")], { stdout: "pipe", stderr: "pipe", timeout: 5000 });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(stderr).toBe("");
  expect(exit).toBe(0);
  expect(stdout).toContain('"debugVersion":"4.4.3"');
  expect(stdout).toContain('"multiEventDriver":"first-only"');
});
