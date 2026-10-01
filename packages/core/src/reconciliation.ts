import type { ResolvedPlan } from "@pylons/contracts";
import { bounded } from "./boundary.js";
import type { Generation } from "./generation.js";
import type { Observation } from "./observation.js";
import type { Selection } from "./selection.js";
import type { RuntimeOptions } from "./types.js";

export function sameExecutable(left: Selection, right: Selection): boolean {
  return JSON.stringify([left.definition, left.extension, left.binding]) === JSON.stringify([right.definition, right.extension, right.binding]);
}

export function sameValues(left: Selection, right: Selection): boolean {
  return JSON.stringify(left.configuration.values) === JSON.stringify(right.configuration.values);
}

export async function replaceConfiguration(
  generation: Generation,
  candidate: Selection,
  plan: ResolvedPlan,
  options: RuntimeOptions,
  observation: Observation,
  candidateCurrent: () => boolean,
): Promise<void> {
  generation.desiredRevision = plan.inventory.revision;
  generation.validity = plan.inventory.validity;
  generation.replacing = true;
  generation.providers.pause();
  const replace = generation.instance?.replaceConfiguration;
  if (!replace) {
    generation.replacing = false;
    await generation.close("restart-required");
    observation.diagnose("restart-required");
    return;
  }
  const result = await bounded(
    () => replace.call(generation.instance, candidate.configuration, generation.lifetime),
    options.clock,
    options.bounds.replacement,
    generation.lifetime,
  );
  if (generation.closed || !candidateCurrent() || !(await generation.allowed(true)) || !candidateCurrent()) {
    await generation.close();
    return;
  }
  const applied = result.kind === "value" && result.value.kind === "applied" && result.value.appliedRevision === plan.inventory.revision;
  if (applied) {
    generation.selection = candidate;
    generation.appliedRevision = plan.inventory.revision;
    generation.replacing = false;
    generation.setState("ready");
    if (generation.ready()) generation.providers.publish();
    return;
  }
  generation.replacing = false;
  const restart = result.kind === "value" && result.value.kind === "restart-required";
  await generation.close(restart ? "restart-required" : "failed");
  observation.diagnose(restart ? "restart-required" : "activation-failed");
}
