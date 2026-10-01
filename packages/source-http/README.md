# @pylons/source-http

Unpublished **0.0.0** ESM metadata adapter for `@pylons/contracts` **0.0.0**.
The initial minor changeset records future 0.1.0 intent; no registry availability
is claimed. Owned source is MIT Copyright (c) Surikaterna.

## Composition and wire contract

`createHttpPlanSource(options)` implements the existing `PlanSource` port.
`createHttpDefinitionCatalog(options, verifiedContext)` implements the existing
`DefinitionCatalog` port, bound to an externally verified host/tenant and
authorization identity. Catalog reads discover metadata only, never install,
import, load, or execute artifacts. There is no core, Weaver, MF, logger or UI edge.

Both endpoints return **the existing canonical `ResolvedPlan` JSON object** on
HTTP 200: `schemaVersion`, `inventory`, `definitions`, `configs`, `provenance`.
There is no new public wire envelope. The injected resolver receives the read
kind, verified context and (for catalog) exact requested definition reference.
The catalog uses the same canonical plan as proof of scoped revision/source/
authorization correspondence, then returns only that exact definition. This
catalog intentionally cannot expose unassigned/global definitions lacking that
proof. It does not treat discovery as installation or execution permission.

Canonical contracts parsing enforces inventory/config/definition/revision
coherence. The source additionally requires exact scope, sourceId and
authorizationId; finite unexpired validity; `authorizedUntil` no later than the
policy grant; and `freshUntil` no later than request-start plus the explicit
policy freshness horizon. Returned validity is not renewed or rewritten.

## Required host policy, clock and transport

All options are explicit: `transport`, `resolveEndpoint`, `authorization`,
`clock`, positive finite `timeoutMilliseconds`, positive safe-integer
`maxResponseBytes`. There is no permissive default policy or universal TTL.
`authorization.authorize(request, endpoint, cancellation)` must verify that
this externally verified scope/authorization identity may read metadata from
this exact endpoint/origin with these exact explicit credentials. It returns
the trusted sourceId, finite authorizedUntil and finite positive
maxFreshnessMilliseconds, or a typed denial. This is **metadata source trust**,
not artifact trust; artifacts require separate host admission/loader policy.
The host supplies a monotonic clock and reliable cancellable scheduler in the
same time coordinate system as source validity and authorization grants.

Endpoint resolution does not itself confer permission. The library snapshots
request context, endpoint headers and grants across asynchronous boundaries.
Do not place endpoint URLs, credentials, config or raw errors in host diagnostics.
Factories expect valid typed collaborators; foreign callback failures during
reads are caught and reduced to safe categories, never error messages/stacks.

`HttpTransport` is a neutral injected bounded transport port; custom adapters
must stop body consumption at maxBytes, honor cancellation and release their
resources. The source also verifies returned UTF-8 body size before JSON parsing.
The optional `@pylons/source-http/fetch` export provides `createFetchTransport()`
using host fetch. It rejects URL userinfo/non-HTTP protocols, omits ambient
credentials, uses GET, never follows redirects, cancels non-200 bodies, checks
declared size and bounds actual streamed bytes **before** decoding/parsing.
It bridges neutral cancellation to a private AbortController, with no public
AbortSignal, Response, URL, DOM, Bun or Node types. The neutral root does not
import the fetch subpath. Internal fetch compilation uses DOM types; both packed
public subpaths typecheck strictly with ES2022/types[]/skipLibCheckfalse.

## Races, errors and recovery

No response cache and no negative cache exist. Every read reauthorizes and
performs transport. Read failure/revocation cannot return or renew last-good
data. Callers must obey `min(freshUntil, authorizedUntil)` for retained plans.
No invalidation event, SSE or polling is implemented; recovery is explicit
caller reread. Source revocation returns `unauthorized` and fails closed.

Within one adapter, the newest read for the same full host/tenant/authorization/
kind/definition lane cancels the previous local request token. Opaque revision
strings are never ordered. Late transport or policy completion cannot be
accepted after cancellation, timeout or supersession, even if a collaborator
ignores cancellation. Distinct tenants and authorization identities have
distinct lanes; terminal paths remove owned subscriptions, timers and lane
entries. Separate adapter instances are independent.

Plan failures use only existing `SourceFailure` codes. Timeout/supersession use
`cancelled`; 401/403 or invalid provenance/grant use `unauthorized`; malformed,
oversized, incoherent or expired plans use `invalid-plan`; other HTTP/transport/
foreign callback failures use `unavailable`. Catalog uses existing
`CatalogFailure`: unauthorized maps to `unavailable` (the port has no denial
code), invalid plan/ref maps to `invalid-definition`, 404 to `not-found`.
All are fail-closed; no URL, body, config, credential or stack is included.

Tests use real local Bun HTTP plus controlled clocks/deferred collaborators.
Clean consumers install actual source/contracts tarballs with a development-only
sibling override. That override is disclosed local evidence, **not** registry proof.
