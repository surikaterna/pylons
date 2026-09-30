import type { Event } from "./event.js";

export interface Cancellation {
  readonly cancelled: boolean;
  readonly onCancel: Event<void>;
}
