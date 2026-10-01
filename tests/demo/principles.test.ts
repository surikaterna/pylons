import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanDemo } from "../../scripts/demo-graph.js";
import { loaderPrinciples } from "../../scripts/loader-principles.js";

test("all private demo production and runner files enforce structural TypeScript principles", async () => {
  for (const pattern of ["apps/**/*.ts", "plugins/**/*.ts", "scripts/demo-*.ts"])
    for await (const path of new Bun.Glob(pattern).scan({ cwd: process.cwd() })) {
      const profile = loaderPrinciples(await Bun.file(path).text(), path);
      expect(profile.lines).toBeLessThanOrEqual(400);
      expect(profile.functionLines).toBeLessThan(50);
      expect(profile.maximumNesting).toBeLessThanOrEqual(3);
    }
});
test("owned demo cleanup refuses symlinks and cannot delete another build tree", async () => {
  const root = await mkdtemp("/tmp/opencode/pylons-demo-clean-");
  const victim = join(root, "victim");
  try {
    await mkdir(victim);
    await writeFile(join(victim, "keep"), "protected");
    await symlink(victim, join(root, ".demo-build"));
    await expect(cleanDemo(root)).rejects.toThrow("demo-output-invalid");
    expect(await readFile(join(victim, "keep"), "utf8")).toBe("protected");
    await rm(join(root, ".demo-build"));
    await mkdir(join(root, ".demo-build"));
    await mkdir(join(root, ".loader-build"));
    await writeFile(join(root, ".loader-build", "keep"), "independent");
    await cleanDemo(root);
    expect(await readFile(join(root, ".loader-build", "keep"), "utf8")).toBe("independent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("browser form is semantic, labelled, live and uses only semantic Pylons color tokens", async () => {
  const html = await Bun.file("apps/browser/index.html").text();
  const css = await Bun.file("apps/browser/styles.css").text();
  for (const field of ["tenant", "session", "title", "reference"]) expect(html).toContain(`for="${field}"`);
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('<form id="validation-form"');
  expect(css).toContain("var(--pylons-surface)");
  expect(css).not.toMatch(/#[a-f\d]{3,8}|rgba?\(/i);
});
