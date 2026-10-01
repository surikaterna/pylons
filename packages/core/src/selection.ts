import type {
  AdmissionRequest,
  ArtifactBinding,
  Cancellation,
  ConfigSideband,
  Extension,
  Installation,
  PluginDefinition,
  ResolvedPlan,
  RuntimeState,
} from "@pylons/contracts";
import { bounded } from "./boundary.js";
import { compatible, definitionKey } from "./compatibility.js";
import type { Observation } from "./observation.js";
import type { RuntimeOptions } from "./types.js";

export interface Selection {
  readonly id: string;
  readonly installation: Installation;
  readonly definition: PluginDefinition;
  readonly configuration: ConfigSideband;
  readonly extension?: Extension;
  readonly binding?: ArtifactBinding;
  readonly state: RuntimeState;
  readonly eligible: boolean;
}

function initialState(
  installation: Installation,
  definition: PluginDefinition,
  extension: Extension | undefined,
  options: RuntimeOptions,
): RuntimeState | undefined {
  if (!installation.enabled) return "disabled";
  const unsupported = definition.contributions.some((entry) => entry.required && !options.supportedContributionKinds.includes(entry.kind));
  if (unsupported) return "unsupported";
  if (extension && (!extension.hosts.includes(options.host) || !compatible(extension.hostContractVersion, options.hostContractVersion))) return "unsupported";
  return undefined;
}

async function admit(
  selection: Omit<Selection, "state" | "eligible">,
  plan: ResolvedPlan,
  options: RuntimeOptions,
  observation: Observation,
  cancellation: Cancellation,
): Promise<Selection> {
  const initial = initialState(selection.installation, selection.definition, selection.extension, options);
  if (initial) return { ...selection, state: initial, eligible: false };
  const request: AdmissionRequest = {
    context: options.context,
    selection: selection.installation,
    definition: selection.definition,
    host: options.host,
    validity: plan.inventory.validity,
    ...(selection.extension ? { extension: selection.extension } : {}),
    ...(selection.binding ? { binding: selection.binding } : {}),
  };
  const decision = await bounded(() => options.policy.evaluate(request), options.clock, options.bounds.policy, cancellation);
  const eligible = decision.kind === "value" && decision.value.kind === "allow";
  if (!eligible) observation.diagnose("admission-denied");
  return { ...selection, eligible, state: eligible ? (selection.extension ? "blocked" : "declaration-only") : "denied" };
}

function candidates(plan: ResolvedPlan): Omit<Selection, "state" | "eligible">[] {
  const result: Omit<Selection, "state" | "eligible">[] = [];
  for (const installation of plan.inventory.installations) {
    const key = definitionKey(installation.definition);
    const definition = plan.definitions.find((value) => definitionKey(value.identity) === key);
    const configuration = plan.configs.find((value) => definitionKey(value.definition) === key);
    if (!definition || !configuration) continue;
    const selected = definition.extensions.filter((extension) => installation.selectedExtensions.includes(extension.id));
    const base = { installation, definition, configuration };
    if (selected.length === 0) result.push({ ...base, id: JSON.stringify([key, null]) });
    for (const extension of selected) {
      const binding = installation.operatorBindings.find((value) => value.extensionId === extension.id);
      result.push({ ...base, id: JSON.stringify([key, extension.id]), extension, ...(binding ? { binding } : {}) });
    }
  }
  return result;
}

export async function selectPlan(
  plan: ResolvedPlan,
  options: RuntimeOptions,
  observation: Observation,
  cancellation: Cancellation,
): Promise<readonly Selection[]> {
  for (const definition of plan.definitions) {
    if (definition.contributions.some((entry) => !entry.required && !options.supportedContributionKinds.includes(entry.kind)))
      observation.diagnose("unsupported-kind");
  }
  return Promise.all(candidates(plan).map((selection) => admit(selection, plan, options, observation, cancellation)));
}
