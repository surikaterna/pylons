import { expect, test } from "bun:test";
import { cancelSource, fixture } from "../../../scripts/loader-fixture.js";
import { type Evaluate, loader } from "../src/loader.js";

let serial = 0;
const moduleFactory = {
  factory: {
    async activate() {
      return { success: false, error: { code: "initialization-failed" } };
    },
  },
};

function completion(asyncEvaluator: boolean) {
  const id = ++serial;
  const data = fixture("https://approved.invalid/", "server", "a".repeat(64), `publication-${id}`);
  const options = { ...data.options, mappings: data.options.mappings.map((mapping) => ({ ...mapping, container: `publication_${id}` })) };
  let finish: (value: unknown) => void = () => {};
  const promise = new Promise<unknown>((resolve) => {
    finish = resolve;
  });
  let signal: AbortSignal | undefined;
  let evaluations = 0;
  const pending: Evaluate = (_mapping, _options, received) => {
    evaluations++;
    signal = received;
    return promise;
  };
  const evaluate: Evaluate = asyncEvaluator ? async (...args) => pending(...args) : pending;
  return {
    request: data.request,
    options,
    actual: loader(options, ["server"], evaluate),
    finish: () => finish(moduleFactory),
    signal: () => signal,
    evaluations: () => evaluations,
  };
}

function cancelAtCompletion(cancel: () => void) {
  queueMicrotask(() => queueMicrotask(() => queueMicrotask(cancel)));
}

for (const asyncEvaluator of [false, true]) {
  const mode = asyncEvaluator ? "async evaluator" : "synchronous Promise evaluator";
  test(`${mode}: last lease abandoned at completion cannot cache winning success or release the version reservation`, async () => {
    const data = completion(asyncEvaluator);
    const cancel = cancelSource();
    const pending = data.actual.load({ ...data.request, cancellation: cancel.cancellation });
    await Promise.resolve();
    data.finish();
    cancelAtCompletion(() => cancel.cancel());
    expect(await pending).toEqual({ success: false, error: { code: "cancelled" } });
    expect(await data.actual.load(data.request)).toEqual({ success: false, error: { code: "cancelled" } });
    expect(data.signal()?.aborted).toBe(true);
    expect(cancel.count()).toBe(0);
    expect(data.evaluations()).toBe(1);
    const binding = { ...data.request.binding, artifactVersion: "2" };
    const alternate = loader({ ...data.options, mappings: data.options.mappings.map((mapping) => ({ ...mapping, binding })) }, ["server"], async () => {
      throw new Error("second-evaluation-forbidden");
    });
    expect(await alternate.load({ ...data.request, binding })).toEqual({ success: false, error: { code: "denied" } });
  });

  test(`${mode}: a surviving completion-boundary lease preserves the successful factory cache`, async () => {
    const data = completion(asyncEvaluator);
    const cancel = cancelSource();
    const survivor = cancelSource();
    const abandoned = data.actual.load({ ...data.request, cancellation: cancel.cancellation });
    const surviving = data.actual.load({ ...data.request, cancellation: survivor.cancellation });
    await Promise.resolve();
    data.finish();
    cancelAtCompletion(() => cancel.cancel());
    expect(await abandoned).toEqual({ success: false, error: { code: "cancelled" } });
    const loaded = await surviving;
    const retry = await data.actual.load(data.request);
    expect(loaded.success && retry.success && loaded.data === retry.data).toBe(true);
    expect(data.signal()?.aborted).toBe(false);
    expect(data.evaluations()).toBe(1);
    expect(cancel.count()).toBe(0);
    expect(survivor.count()).toBe(0);
  });
}
