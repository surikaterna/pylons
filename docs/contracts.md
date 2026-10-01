# Portable contracts (.2)

Canonical issue armada-0wq76.2. This implementation is data schemas/parsers and
declaration-only injected seams, **not a coordinator** or the proposed complete runtime.
The PRD/ARB/future proposals and their restoration checks remain unchanged.

## Data API

The root `@pylons/contracts` facade exports four named parsers, readonly inferred
data types, `JsonValue`, `Result`, sanitized parsing failures and neutral ports.
Internal schemas/helpers are not public subpaths. Unknown envelope keys fail closed.
Strings naming IDs/artifact keys are logical identifiers (no URLs); revisions and
definition/artifact/host/service versions are independent opaque equality tokens,
not inferred semver compatibility. Locator syntax is operator data, not trust approval.

| Data | Contents |
| --- | --- |
| DefinitionRef | pluginId, definitionVersion |
| PluginDefinition | schemaVersion 1; identity pluginId/name/definitionVersion; explicit contributions/extensions/dependencies; optional JSON configurationSchema |
| Contribution | id, namespaced `namespace:kind`, explicit required, JSON metadata, optional capabilityId/contractVersion provider |
| Extension | id, logical artifactKey, server/browser/cli hosts, hostContractVersion, provides, startup or demand-capability activation, explicit plugin/capability required dependency edges |
| InstallationInventory | schemaVersion 1; hostId/tenantId scope; revision; finite epoch freshUntil/authorizedUntil; definition/enabled/selectedExtensions/operatorBindings installations |
| ConfigSideband | schemaVersion 1; scope/revision/definition; JSON values, separate from public discovery |
| ArtifactBinding | extensionId/artifactKey/artifactVersion/locator/loaderId; integrity algorithm sha256 and lowercase 64-character digest |
| ResolvedPlan | schemaVersion 1; inventory/referenced definitions/configs; provenance sourceId/revision/authorizationId |

Plan parsing checks equal inventory/config/provenance revision, equal scope, exact
definition correspondence, duplicate identities/selections/bindings, unresolved
extensions and selected artifactKey/extensionId matching. Every installation has
exactly one config, even if empty, and every selected extension exactly one binding.
Unreferenced definition/config records are rejected. Disabled selections remain
data; their enablement/admission effects belong to the runtime. Syntax/coherence
does not authorize a context, evaluate freshness, validate config against a JSON
Schema dialect, prove artifact integrity, negotiate versions or detect dependency cycles.

## Parser ownership and diagnostics

Unknown inputs undergo descriptor-only bounded graph inspection and detached JSON
snapshot creation **before** recursive Zod parsing. Accessors are not invoked;
plain/null-prototype objects and ordinary dense arrays are accepted; cycles,
class instances, symbols, sparse arrays, nonfinite numbers and executable values fail.
Repeated acyclic references are allowed and copied per occurrence. Bounds are 10,000
visited values, depth 64 and 1,000,000 aggregate string/key characters, parsing safety
limits rather than production validity SLAs. JSON snapshots are recursively frozen;
schema readonly nodes are shallow-frozen individually. Adapter callers still own
the obligation to supply immutable scoped config: interfaces cannot freeze external data.
Proxy traps are not sandboxed. Inspection failures become safe invalid-json results.

Failures have only invalid-json/invalid-contract code and at most 32 path/category
issues. Path segments come from a schema-field allowlist or numeric index; unknown
segments are `*`. No rejected values, raw keys, Zod messages/errors or stacks escape.
Required metadata/values use a JSON refinement, not `unknown` (which in v3 accepts
omission). The recursive JSON anchor validates every value; its output is discarded
because v3 record parsing drops own `__proto__`. The preserving refinement retains
the detached snapshot, including that valid key, without a key ban or prototype mutation.

## Runtime seams and lifetimes

`PlanSource.read(VerifiedContext, Cancellation)` returns operation-specific source
failures or a resolved plan. Optional invalidation events are hints, never authority.
`DefinitionCatalog.read` is metadata-only, never installation/admission or execution.
`ArtifactLoader.load` takes definition/extension/host/binding/cancellation and returns
a **reusable PluginFactory**, not a tenant singleton. `AdmissionPolicy.evaluate`
returns typed allow/deny over verified scoped selection, binding and validity.

`PluginFactory.activate` asynchronously receives scoped generation, host, immutable
config, neutral cancellation, ProviderRegistrar and ResourceOwnership. No principal,
credential or transaction is in activation. Providers receive JSON input and narrow
principal/credential-reference/transaction/cancellation plus optional opaque hostContext
**per invocation**. References are not raw secrets and plugins must not retain request
identity. The host authorizes each invocation independently of metadata/admission.

Partial initialization must hand acquired resources to ResourceOwnership immediately.
OwnedResource and ActivatedInstance cleanup are async typed results; the future host
coordinator owns late/failure cleanup and all-cleanup-attempt behavior. Tests demonstrate
ownership handoff, not an implemented coordinator. Optional config replacement explicitly
returns applied/restart-required/failed; applied revision advances only on real application.

Snapshots declare absent/disabled/denied/unsupported/blocked/loading/activating/ready/
failed/stopped/declaration-only/restart-required with scoped generation and desired/applied
revision. Lifecycle observation is typed state, not parsed logs. DiagnosticSink accepts
bounded levels/safe code enum and optional host-approved opaque correlation (sink must
bound length), no arbitrary payload or raw errors. Clock schedules through Disposable,
not DOM timers. Cancellation is state/subscription, not a public AbortSignal. These are
interfaces only; no factories, DI container, semver engine or lifecycle implementation.

## Source adaptation and intentional divergence

Runtime reference **146f7336a3e70412e764c07e566edcbf54803836**, Ghost paths:
`packages/plugin-contracts/src/{disposable,event,types,schemas,parsing}.ts` and
`packages/plugin-contracts/test/parse-plugin-contract.test.mjs`.
Documentation reference **6169eb215dadbafd547096edef87240911648344**:
`docs/architecture/plugin-contract-and-plugin-inventory.md` and
`plugin-envelope-host-deployment-boundaries.md`; local uncommitted extraction
plan/handoff remain planning inputs, not fabricated SHA links.

Only sync Disposable and subscription Event concepts were selectively adapted,
with new neutral Cancellation; no whole Ghost file copied. Strict schema/result
ideas informed a new canonical data model. Types infer from schema instead of the
source's unsafe result casts. ServiceToken/DI phantom typing is deferred. Weaver
config catalog/backedges, UI/theme, routes, commands/actions, predicates, federation
and legacy helpers/subpaths remain in Ghost, untouched.

| Source test/topic | Canonical coverage / explicit non-equivalence |
| --- | --- |
| valid/minimal manifest; required identity errors | definition identity, zero extensions, required contribution obligation |
| capabilities/dependency shapes | capabilityId/contractVersion and plugin/capability discriminated required edges; no version-range engine |
| strict unexpected/nested fields | all canonical envelopes strict, missing/non-JSON values tested |
| tenant descriptors/scope | separate scoped inventory/config/plan, zero-entry allowed; no legacy entry/compatibility fields |
| source displayName/routes/hidden/slot when drift | intentionally unsupported canonical envelope/nested legacy fields tested; route Zod values not serializable |
| source action predicate fixture versus schema when | neither predicate nor when is an envelope API; inert JSON metadata may describe host-specific data but does not execute predicates |
| action dispatch/composition/theme/gallery/compatibility tests | not ported as runtime semantics; retained Ghost responsibilities, no accidental compatibility claim |

The source parser suite is characterization input, not an asserted executed passing
Ghost baseline. New risk tests cover finite JSON/cycles/getters/own keys/bounds,
coherence, type negatives, zero metadata execution, two factory scopes/request identities
and every injected port. Complete engine/security/transport race tests belong to later issues.

## Author fixture for .3 (not started)

A separately built artifact may implement one logical `validation` extension with
hosts `["server", "browser", "cli"]`, artifactKey `validation-code`, host contract
`1`, capability `validation` contract `1`, demand-capability activation. Definitions
carry metadata first, with no code execution. Operator bindings choose independent
artifact versions/locators/integrity/loaderId; MF expose/manifest details remain in
the future adapter. One reusable factory must activate separately for tenant A/B
with separate config/generation and request-local authority. Same logical extension
does not require one universal physical bundle. .3 must prove actual server/browser/CLI
HTTP execution and logging; these seam fakes/local tarballs are not that proof.

## Dependency/release decision

Builder decision `01a0f3ed-1422-71e1-9565-2ef0bb5276e2` approves exact Zod 3.25.76
via `zod/v3` after v4 root declaration failure. No ambient shim or skipLibCheck
exception. Zod is third-party MIT, unmodified. @changesets/cli 2.29.7 is exact-pinned
development-only for the real Changesets workflow/config, never package runtime.
The package stays unpublished 0.0.0, initial MINOR changeset eventual 0.1.0 intent.
No version/publish command, CJS claim, registry consumer or pre-audit commit/push.
