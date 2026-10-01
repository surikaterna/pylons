import type { ArtifactLoader, LoadRequest, PluginFactory, Provider } from "@pylons/contracts";
import { cancelSource, neverCancelled } from "./loader-fixture.js";

async function scoped(factory: PluginFactory, request: LoadRequest, tenant: string, minimum: number) {
  let provider: Provider | undefined;
  const instance = await factory.activate({
    generation: { scope: { hostId: "host", tenantId: tenant }, definition: request.definition.identity, generationId: tenant, desiredRevision: "1" },
    host: request.host,
    configuration: {
      schemaVersion: 1,
      scope: { hostId: "host", tenantId: tenant },
      revision: "1",
      definition: request.definition.identity,
      values: { minimum },
    },
    cancellation: neverCancelled,
    providers: {
      register(_capability, value) {
        provider = value;
        return { success: true, data: { dispose() {} } };
      },
    },
    resources: { own() {} },
  });
  if (!instance.success || !provider) throw new Error("activation-failed");
  try {
    return { first: await invoke(provider, tenant, "first"), second: await invoke(provider, tenant, "second") };
  } finally {
    await instance.data.cleanup();
  }
}

async function invoke(provider: Provider, tenant: string, invocation: string) {
  const identity = `${tenant}-${invocation}`;
  const result = await provider.invoke(
    { title: "four" },
    {
      principal: { subjectId: identity },
      credential: { reference: `${identity}-credential` },
      transaction: { id: `${identity}-transaction` },
      cancellation: neverCancelled,
    },
  );
  if (!result.success) throw new Error("invoke-failed");
  return result.data;
}

export async function exercise(actual: ArtifactLoader, request: LoadRequest, scenario: string) {
  if (scenario === "shared-cancel") {
    const cancel = cancelSource();
    const abandoned = actual.load({ ...request, cancellation: cancel.cancellation });
    const surviving = actual.load(request);
    cancel.cancel();
    const stopped = await abandoned;
    if (stopped.success || stopped.error.code !== "cancelled") throw new Error("lease-failed");
    const loaded = await surviving;
    if (!loaded.success) throw new Error("survivor-failed");
    return { code: "loaded", sameFactory: true, instances: [await scoped(loaded.data, request, "a", 2), await scoped(loaded.data, request, "b", 8)] };
  }
  if (scenario === "cancel") {
    const cancel = cancelSource();
    const pending = actual.load({ ...request, cancellation: cancel.cancellation });
    setTimeout(() => cancel.cancel(), 20);
    const result = await pending;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { code: result.success ? "unexpected" : result.error.code };
  }
  const [left, right] = await Promise.all([actual.load(request), actual.load(request)]);
  if (!left.success) return { code: left.error.code };
  if (!right.success) throw new Error("second-load-failed");
  return {
    code: "loaded",
    sameFactory: left.data === right.data,
    instances: [await scoped(left.data, request, "a", 2), await scoped(left.data, request, "b", 8)],
  };
}

export function metrics(): unknown {
  return Reflect.get(globalThis, "loaderMetrics") ?? { evaluated: 0, activated: 0, invoked: 0, cleaned: 0 };
}
