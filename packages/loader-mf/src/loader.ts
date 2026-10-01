import type { ArtifactLoader, Host, LoadRequest } from "@pylons/contracts";
import { admittedOptions, select } from "./admission.js";
import { namedFactory } from "./factory-guard.js";
import { lease } from "./leases.js";
import { LoadError } from "./transport.js";
import type { ArtifactMapping, LoaderOptions } from "./types.js";
import { flight, type Loaded, reserve } from "./version-policy.js";

export type Evaluate = (mapping: ArtifactMapping, options: LoaderOptions, signal: AbortSignal) => Promise<unknown>;

async function execute(mapping: ArtifactMapping, options: LoaderOptions, signal: AbortSignal, evaluate: Evaluate): Promise<Loaded> {
  const controller = new AbortController();
  // Owned work remains linked to flight abandonment through terminal publication.
  const effective = AbortSignal.any([signal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let release = () => {};
  const stopped = new Promise<Loaded>((resolve) => {
    const abort = () => resolve({ success: false, error: { code: signal.aborted ? "cancelled" : "load-failed" } });
    effective.addEventListener("abort", abort, { once: true });
    release = () => effective.removeEventListener("abort", abort);
    if (effective.aborted) abort();
    timer = setTimeout(() => controller.abort(), options.limits.timeoutMilliseconds);
  });
  const work = async (): Promise<Loaded> => {
    try {
      const module = await evaluate(mapping, options, effective);
      if (effective.aborted) return { success: false, error: { code: signal.aborted ? "cancelled" : "load-failed" } };
      const exported = namedFactory(module, mapping.exportName);
      if (!exported) return { success: false, error: { code: "invalid-factory" } };
      return { success: true, data: Object.freeze({ activate: exported.activate.bind(exported) }) };
    } catch (error) {
      return { success: false, error: { code: error instanceof LoadError ? error.code : "load-failed" } };
    }
  };
  try {
    const result = await Promise.race([work(), stopped]);
    if (effective.aborted) return { success: false, error: { code: signal.aborted ? "cancelled" : "load-failed" } };
    return result;
  } finally {
    clearTimeout(timer);
    release();
  }
}

export function loader(options: LoaderOptions, hosts: readonly Host[], evaluate: Evaluate): ArtifactLoader {
  const admitted = admittedOptions(options);
  const load = async (request: LoadRequest): Promise<Loaded> => {
    if (request.cancellation.cancelled) return { success: false, error: { code: "cancelled" } };
    if (!hosts.includes(request.host)) return { success: false, error: { code: "unsupported-host" } };
    const mapping = admitted && select(request, admitted);
    if (!admitted || !mapping || !reserve(mapping, admitted.limits.maximumReservations)) return { success: false, error: { code: "denied" } };
    const result = await lease(
      flight(mapping, (signal) => execute(mapping, admitted, signal, evaluate)),
      request.cancellation,
    );
    if (!result.success) {
      try {
        admitted.diagnostics.write({ level: "warn", code: "load-failed" });
      } catch {
        /* Observation cannot change load results. */
      }
    }
    return result;
  };
  return Object.freeze({
    async load(request: LoadRequest): Promise<Loaded> {
      try {
        return await load(request);
      } catch {
        return { success: false, error: { code: "denied" } };
      }
    },
  });
}
