export const sourceTypeConsumer = `
import { createHttpPlanSource, createHttpDefinitionCatalog, type HttpSourceOptions, type HttpTransport } from '@pylons/source-http';
import { createFetchTransport } from '@pylons/source-http/fetch';
import { parseResolvedPlan, type PlanSource, type DefinitionCatalog, type Cancellation } from '@pylons/contracts';
const transport: HttpTransport = createFetchTransport();
const cancel: Cancellation = { cancelled: false, onCancel: () => ({ dispose() {} }) };
const options: HttpSourceOptions = {
  transport, maxResponseBytes: 4096, timeoutMilliseconds: 100,
  clock: { now: () => 1000, schedule: () => ({ dispose() {} }) },
  resolveEndpoint: () => ({ url: 'https://approved.invalid/metadata', headers: {} }),
  authorization: { async authorize() { return { success: true, data: { sourceId: 'fixture', authorizedUntil: 2000, maxFreshnessMilliseconds: 500 } }; } },
};
const context = { scope: { hostId: 'host', tenantId: 'tenant' }, authorizationId: 'grant' };
const source: PlanSource = createHttpPlanSource(options);
const catalog: DefinitionCatalog = createHttpDefinitionCatalog(options, context);
void source.read(context, cancel); void catalog.read({ pluginId: 'metadata', definitionVersion: '1' }, cancel);
void parseResolvedPlan({});
// @ts-expect-error Neutral API must not require DOM or expose an AbortSignal.
const ambient: AbortSignal = cancel;
void ambient;
`;

export const sourceRuntimeConsumer = `
import { createHttpPlanSource, createHttpDefinitionCatalog } from '@pylons/source-http';
import { createFetchTransport } from '@pylons/source-http/fetch';
import { parseResolvedPlan } from '@pylons/contracts';
const context = { scope: { hostId: 'host', tenantId: 'tenant' }, authorizationId: 'grant' };
const ref = { pluginId: 'metadata', definitionVersion: '1' };
const definition = { schemaVersion: 1, identity: { ...ref, name: 'Metadata' }, contributions: [], extensions: [], dependencies: [] };
const plan = { schemaVersion: 1,
  inventory: { schemaVersion: 1, scope: context.scope, revision: 'r', validity: { freshUntil: 1500, authorizedUntil: 1500 }, installations: [{ definition: ref, enabled: true, selectedExtensions: [], operatorBindings: [] }] },
  definitions: [definition], configs: [{ schemaVersion: 1, scope: context.scope, revision: 'r', definition: ref, values: {} }],
  provenance: { sourceId: 'fixture', revision: 'r', authorizationId: 'grant' } };
if (!parseResolvedPlan(plan).success) throw new Error('canonical parsing failed');
const cancellation = { cancelled: false, onCancel: () => ({ dispose() {} }) };
const settings = { maxResponseBytes: 4096, timeoutMilliseconds: 500,
  clock: { now: () => 1000, schedule: () => ({ dispose() {} }) },
  resolveEndpoint: () => ({ url: 'http://localhost/metadata', headers: {} }),
  authorization: { async authorize() { return { success: true, data: { sourceId: 'fixture', authorizedUntil: 2000, maxFreshnessMilliseconds: 1000 } }; } },
  transport: { async read() { return { success: true, data: { status: 200, body: JSON.stringify(plan) } }; } } };
if (!(await createHttpPlanSource(settings).read(context, cancellation)).success) throw new Error('mock ESM source failed');
if (!(await createHttpDefinitionCatalog(settings, context).read(ref, cancellation)).success) throw new Error('mock ESM catalog failed');
let requests = 0;
const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch() { requests++; return Response.json(plan); } });
try {
  const actual = { ...settings, transport: createFetchTransport(), resolveEndpoint: () => ({ url: server.url.href, headers: {} }) };
  if (!(await createHttpPlanSource(actual).read(context, cancellation)).success) throw new Error('packed actual HTTP source failed');
  if (!(await createHttpDefinitionCatalog(actual, context).read(ref, cancellation)).success) throw new Error('packed actual HTTP catalog failed');
  if (requests !== 2) throw new Error('metadata request count mismatch');
} finally { server.stop(true); }
console.log('Packed source canonical ESM mock and actual HTTP consumers passed; no code requests');
`;
