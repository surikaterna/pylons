import { object } from "../apps/shared/domain.js";
import type { Client } from "./demo-client.js";
import { FoundationError } from "./policy.js";

export function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new FoundationError(`demo-${code}`);
}
export function get(value: unknown, key: string): unknown {
  return object(value) ? value[key] : undefined;
}
export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
export function events(value: unknown): readonly Record<string, unknown>[] {
  return list(get(value, "remote")).filter(object);
}
export function snapshots(value: unknown, scope: string): readonly Record<string, unknown>[] {
  return list(get(get(value, "snapshots"), scope)).filter(object);
}
export function count(value: unknown, kind: string, plugin?: string, scope?: string): number {
  return events(value).filter((event) => event.kind === kind && (!plugin || event.plugin === plugin) && (!scope || event.tenant === scope)).length;
}
export function balanced(value: unknown): void {
  for (const scope of ["a", "b"])
    for (const plugin of ["basic-validation", "reference-required"]) {
      check(count(value, "acquired", plugin, scope) === count(value, "cleanup", plugin, scope), "resource-cleanup");
    }
}
export async function waitFor(condition: () => boolean): Promise<void> {
  const until = Date.now() + 2500;
  while (!condition()) {
    if (Date.now() > until) throw new FoundationError("demo-held-bound");
    await Bun.sleep(5);
  }
}
export async function validate(client: Client, token: string, title: string, code: number, reference?: string, baseOnly = false): Promise<void> {
  const result = await client.command({ op: "validate", token, document: { title, ...(reference === undefined ? {} : { reference }) }, baseOnly });
  check(get(result, "code") === code, "validation-result");
}
export function logging(value: unknown, both: boolean): void {
  const log = get(value, "logging");
  const text = JSON.stringify(log);
  check(!text.includes("SENTINEL"), "prequeue-middleware-output-redaction");
  check(
    list(get(log, "backend")).some((line) => typeof line === "string" && line.includes("demo bootstrap")),
    "preferred-root-backend",
  );
  if (both)
    for (const name of ["demo-basic", "demo-reference"]) {
      for (const kind of ["evaluation", "activation", "invocation", "cleanup"])
        check(
          list(get(log, "backend")).some((line) => typeof line === "string" && line.includes(name) && line.includes(`demo ${kind}`)),
          "remote-root-facade",
        );
    }
}
