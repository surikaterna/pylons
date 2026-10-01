import type { Clock, OwnedResource, ResourceOwnership } from "@pylons/contracts";
import { bounded } from "./boundary.js";

export class OwnedResources implements ResourceOwnership {
  private readonly resources = new Map<OwnedResource, Promise<boolean> | undefined>();
  private closed = false;

  constructor(
    private readonly clock: Clock,
    private readonly duration: number,
    private readonly failed: () => void,
  ) {}

  own(resource: OwnedResource): void {
    if (this.resources.has(resource)) return;
    this.resources.set(resource, undefined);
    if (this.closed) void this.clean(resource);
  }

  private clean(resource: OwnedResource): Promise<boolean> {
    const existing = this.resources.get(resource);
    if (existing) return existing;
    const work = bounded(() => resource.cleanup(), this.clock, this.duration).then((result) => {
      const success = result.kind === "value" && result.value.success;
      if (!success) this.failed();
      return success;
    });
    this.resources.set(resource, work);
    return work;
  }

  close(): Promise<boolean> {
    this.closed = true;
    return Promise.all([...this.resources.keys()].map((resource) => this.clean(resource))).then((results) => results.every(Boolean));
  }
}
