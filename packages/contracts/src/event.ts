import type { Disposable } from "./disposable.js";

export type Event<T> = (listener: (value: T) => void) => Disposable;
