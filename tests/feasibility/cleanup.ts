import type { OwnedResource } from "@pylons/contracts";
import { bounded } from "./timeout.js";

export class CleanupFailure extends Error {
  override readonly name = "CleanupFailure";
  constructor() {
    super("cleanup-failed");
  }
}

export async function cleanupResources(resources: readonly OwnedResource[], milliseconds = 5000): Promise<void> {
  // Start every owned cleanup before awaiting any rejection or timeout; one resource cannot starve the others.
  const results = await Promise.all(
    resources.map(async (resource) => {
      try {
        return (
          await bounded(
            Promise.resolve().then(() => resource.cleanup()),
            milliseconds,
          )
        ).success;
      } catch {
        return false;
      }
    }),
  );
  if (results.some((success) => !success)) throw new CleanupFailure();
}
