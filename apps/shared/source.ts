import type { Host, VerifiedContext } from "@pylons/contracts";
import { createHttpDefinitionCatalog, createHttpPlanSource, type HttpSourceOptions } from "@pylons/source-http";
import { createFetchTransport } from "@pylons/source-http/fetch";
import { type Artifact, artifactFor, binding, definition } from "./definitions.js";
import { DemoError, object, plugins, type Tenant } from "./domain.js";
import { HostClock, Signal } from "./lifetime.js";

export async function operatorArtifacts(origin: string): Promise<readonly Artifact[]> {
  const url = new URL("operator/artifacts", origin);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new DemoError();
  const cancellation = new Signal();
  const timer = new HostClock().schedule(1000, () => cancellation.cancel());
  try {
    const response = await createFetchTransport().read({
      endpoint: { url: url.href, headers: { authorization: "Bearer demo-operator" } },
      maxBytes: 10000,
      cancellation,
    });
    if (!response.success || response.data.status !== 200) throw new DemoError();
    return parseArtifacts(JSON.parse(response.data.body));
  } finally {
    timer.dispose();
  }
}
export function parseArtifacts(value: unknown): readonly Artifact[] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(artifact) || new Set(value.map((entry) => entry.file)).size !== 4) throw new DemoError();
  return value;
}
function artifact(value: unknown): value is Artifact {
  return (
    object(value) &&
    plugins.some((plugin) => plugin === value.plugin) &&
    (value.target === "browser" || value.target === "server") &&
    typeof value.file === "string" &&
    value.file === `artifacts/${value.plugin}/${value.target}.js` &&
    typeof value.bytes === "number" &&
    value.bytes > 0 &&
    value.bytes < 1000000 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  );
}
export function metadataPorts(origin: string, host: Host, scope: Tenant, clock: HostClock) {
  const context: VerifiedContext = { scope: { hostId: `${host}-demo`, tenantId: scope }, authorizationId: `demo-${scope}` };
  const token = `Bearer metadata-${host}-${scope}`;
  const grantUntil = clock.now() + 65000;
  const options: HttpSourceOptions = {
    transport: createFetchTransport(),
    clock,
    timeoutMilliseconds: 1000,
    maxResponseBytes: 100000,
    resolveEndpoint: (request) => ({
      url: new URL(`${request.kind === "plan" ? "metadata" : "catalog"}/${host}/${scope}`, origin).href,
      headers: { authorization: token },
    }),
    authorization: {
      async authorize(request, endpoint) {
        const expected = new URL(`${request.kind === "plan" ? "metadata" : "catalog"}/${host}/${scope}`, origin).href;
        if (
          endpoint.url !== expected ||
          endpoint.headers.authorization !== token ||
          request.context.authorizationId !== context.authorizationId ||
          request.context.scope.hostId !== context.scope.hostId ||
          request.context.scope.tenantId !== scope
        )
          return { success: false, error: { code: "unauthorized" } };
        return { success: true, data: { sourceId: "loopback-fixture", authorizedUntil: grantUntil, maxFreshnessMilliseconds: 65000 } };
      },
    },
  };
  return { context, source: createHttpPlanSource(options), catalog: createHttpDefinitionCatalog(options, context) };
}
export function loaderOptions(origin: string, host: Host, artifacts: readonly Artifact[], diagnostics: import("@pylons/contracts").DiagnosticSink) {
  return {
    operatorId: "demo-operator",
    trustedOperatorIds: ["demo-operator"],
    trustedPublisherIds: ["demo-publisher"],
    trustedOrigins: [new URL(origin).origin],
    diagnostics,
    mappings: plugins.map((plugin) => {
      const selected = binding(artifactFor(artifacts, plugin, host), origin);
      return {
        definition: definition(plugin),
        binding: selected,
        host,
        publisherId: "demo-publisher",
        container: `demo_${plugin.replaceAll("-", "_")}`,
        expose: "./factory",
        exportName: "factory",
        profile: "single-script",
        executableFiles: [selected.locator],
      } satisfies import("@pylons/loader-mf/server").ArtifactMapping;
    }),
    limits: { timeoutMilliseconds: 1000, maximumBytes: 1000000, maximumMappings: 8, maximumMetadataCharacters: 20000, maximumReservations: 100 },
  };
}
