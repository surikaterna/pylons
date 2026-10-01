import type { PluginFactory } from "@pylons/contracts";
import { isObject } from "./artifact-index.js";

export function isFactory(value: unknown): value is PluginFactory {
  return isObject(value) && typeof value.activate === "function";
}
