import { expect, test } from "bun:test";
import { loaderPrinciples } from "../../scripts/loader-principles.js";

test("private diagnostics satisfy bounded source, functions, nesting and strict types", async () => {
  for (const path of [
    "apps/shared/host.ts",
    "apps/shared/logging.ts",
    "apps/shared/source-outcomes.ts",
    "apps/shared/diagnostic-view.ts",
    "apps/cli/main.ts",
    "apps/cli/diagnostics.ts",
    "apps/browser/main.ts",
    "apps/browser/lifecycle-model.ts",
    "apps/browser/lifecycle-view.ts",
    "apps/browser/view.ts",
    "scripts/demo-clarity-e2e.ts",
    "scripts/demo-diagnostics-e2e.ts",
  ]) {
    const result = loaderPrinciples(await Bun.file(path).text(), path);
    expect(result.lines).toBeLessThanOrEqual(400);
    expect(result.functionLines).toBeLessThan(50);
    expect(result.maximumNesting).toBeLessThanOrEqual(3);
    console.log("Demo diagnostics principles", path, JSON.stringify(result));
  }
});
