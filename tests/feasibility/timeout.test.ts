import { expect, test } from "bun:test";
import { requestContext } from "./request-context.js";
import { bounded, FeasibilityTimeout } from "./timeout.js";

test("private boundary timeouts are bounded and successful work clears the timer", async () => {
  expect(await bounded(Promise.resolve("completed"), 100)).toBe("completed");
  await expect(bounded(new Promise<never>(() => {}), 1)).rejects.toBeInstanceOf(FeasibilityTimeout);
});

test("each invocation has request-local principal, credential reference, transaction and cancellation", () => {
  const first = requestContext("first");
  const second = requestContext("second");
  expect(first).not.toBe(second);
  expect(first.principal).not.toBe(second.principal);
  expect(first.credential).not.toBe(second.credential);
  expect(first.transaction.id).not.toBe(second.transaction.id);
  expect(first.cancellation.cancelled).toBe(false);
  expect(Object.keys(first.credential)).toEqual(["reference"]);
});
