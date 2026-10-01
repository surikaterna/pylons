import { expect, test } from "bun:test";
import { loaderPrinciples } from "../../scripts/loader-principles.js";

test("private public-API probe follows structural TypeScript principles", async () => {
  const path = `${import.meta.dir}/invocation-timeout-probe.ts`;
  const result = loaderPrinciples(await Bun.file(path).text(), path);
  expect(result.lines).toBeLessThanOrEqual(400);
  expect(result.functionLines).toBeLessThan(50);
  expect(result.maximumNesting).toBeLessThanOrEqual(3);
});
