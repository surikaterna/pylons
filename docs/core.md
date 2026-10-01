# Neutral lifecycle core — armada-0wq76.4

New `@pylons/core` 0.0.0 ESM/declarations; initial MINOR changeset, no versioning,
publication, Ghost adoption, registry consumer, PR or merge. Core depends only on
exact `@pylons/contracts` 0.0.0. Existing contracts API/minor changeset and private
feasibility implementations remain unchanged. This is not the .7 integration demo.

## API and authority

`createRuntime(RuntimeOptions)` requires verified host/tenant/authorization context,
host and opaque host contract version, source, loader, admission policy, authoritative
per-call authorization, clock, observer, diagnostic sink, explicit bounds for source,
policy, load, activation, invocation, replacement and cleanup, supported contribution
kinds, security startup capabilities, externally ready host capabilities and a shared
version owner (`createVersionOwnership`). Share one owner across all coordinators
using a process/module cache; retain it after shutdown because code cannot be unloaded. Empty
security requirements must be explicit, never a permissive default. Options/scope and
request identity/reference fields are detached; injected ports remain host-owned.

The returned runtime has `refresh`, metadata-only `metadata`, `startup`, `demand`,
guarded `invoke`, `snapshots`, `onState`, and `shutdown`. Metadata contains admitted
supported contributions, never private sideband. Call `refresh` before startup/demand.
`invoke` does not secretly perform demand: callers explicitly demand then invoke.
No provider handle is returned. Every invocation checks current generation, finite
validity, security providers, required readiness and admission, obtains an explicit
authoritative per-call allow decision, and rechecks before invoking. Request principal,
credential reference, transaction, cancellation and opaque hostContext are local to
that call. Admission is not authentication or domain validation. Hosts supply verified
context; plugins/source payloads cannot grant themselves permission.

## Planner and eligibility semantics

Nodes are selected extensions, or one declaration-only presence node for a selection
with zero entries, within one verified host/tenant runtime generation. Definition-level
dependencies apply to every selected node; extension dependencies add edges. Required
plugin dependencies need the exact enabled/admitted definition and require **every** selected
entry to be eligible and initialize. An unsupported or policy-denied selected sibling blocks
the dependent before load; an eligible subset cannot satisfy the plugin requirement.
Declaration-only presence does not provide a ready capability. Optional dependencies still
do not force activation or block required readiness.
Required capabilities need exactly one eligible selected exact-contract-version provider
or exactly one externally ready host provider. Ambiguity fails; registration order cannot
choose a winner. Versions are opaque equality tokens, **not semver ranges**.

Self-plugin and self-readiness edges are cycles. Reachability identifies actual cycle
members separately from downstream blocked nodes, then topological layers preserve
unrelated usable graphs. Required closure is checked before load; policy, host compatibility
and unsupported required contributions reject before evaluation. Optional edges never force
lazy activation or create a required failure; unavailable optional targets and unsupported
kinds diagnose through fixed safe categories. No automatic enablement or legacy helper.

## Temporal ownership

Each selected generation has one flight. Demand callers hold individual cancellation
leases; startup holds durable interest. One cancellation cannot abort another caller's
work. Last-lease abandonment before readiness cancels/closes the old generation; later
demand gets a new identity. Ready instances belong to the generation until revocation.
Provider registrations are provisional until activation and required readiness succeed.
Resources must be handed to `resources.own` immediately, including partial initialization.
Resource identity is deduplicated within that generation, including an instance also owned
as a resource. All cleanup attempts start independently; throw, typed failure or configured
timeout cannot skip other disposers. Late resources and successful late instances are cleaned.

Shutdown synchronously closes admission, withdraws ready providers and cancels work before
awaiting bounded cleanup. Publication checks generation/closed state, current validity and
policy after asynchronous boundaries. Observer/logging failures are isolated. Snapshots and
diagnostics carry safe typed states/codes, not configs, input documents, raw errors or stacks.

## Refresh and limitations

Rereads serialize and coalesce using local request tokens, never revision sorting. Parsing,
scope, authorization provenance and finite validity precede acceptance. Read failures/hints
do not renew validity. An explicit unauthorized source result revokes admission immediately,
including a result whose read token was superseded by another refresh or hint. Stale success
candidates are discarded; explicit revocation is processed before that token filter.
Revocation is a scoped coordinator-wide latch, including empty plans, externally ready host
targets and external security providers. It cancels the current admission epoch and closes
plugin generations. Startup, metadata, demand, provider resolution and protected invocation
fail closed. In-flight invocation guards retain their original epoch and cannot publish a late
result after revocation, even if a subsequent authorized read has already restored admission.
Only a parsed, scope/provenance-valid, still-current authoritative candidate can restore the
latch; read errors, invalid candidates or hints alone cannot. Recovery creates a fresh admission
epoch and revoked plugin instances require activation again. Other scoped coordinators remain
independent. Expiry closes the same scoped admission boundary.
Last-good admission lasts only before the minimum freshness and
authorization expiry; clock expiry withdraws readiness. `refresh` reports candidate-read
acceptance; per-generation snapshots report actual application/failure separately.

Desired and applied revisions differ until actual supported replacement returns the exact
candidate applied revision. Replacement pauses admission/readiness, including dependents.
Unsupported replacement is restart-required; failed/mismatched results do not advance applied.
Disable/revocation withdraw even an instance pending restart. Superseded replacement cannot
publish; a later authoritative reread controls recovery. Changed evaluated artifact/definition
identities cannot silently reuse the previous version: the mandatory shared version owner
rejects conflicts before load across coordinators and after shutdown. Composition must share
that owner for its process/module cache; this core does not claim isolated per-tenant module
namespaces or process-wide unload. Per-host physical bindings may differ; definition versions
remain process-owner-wide opaque identities.

Bounds are supplied host policy, not universal duration assumptions. Noncooperative promises
cannot be killed. Shutdown bounds currently acquired cleanup; later acquisition is still cleaned
and diagnosed, but cannot retroactively change a settled shutdown result. Trusted publishers
can bypass in-process APIs; namespacing is not a sandbox. No RPC, intent framework, source
precedence resolver, HTTP/MF adapter, logger vendor or UI was added.

## Packaging and provenance

Root inventory allows only exact contracts/core public manifests plus existing private harness
manifests. Contracts closure keeps its original exact profile; core adds a separate profile.
Actual Bun tarballs install in a clean consumer with only a core direct dependency. A **consumer-
only local override** resolves the unpublished exact-version contracts dependency to its actual
sibling tarball; packed/installed runtime manifests remain registry-exact, never workspace/file/link.
This is explicitly not registry-resolution evidence. Consumers run real ESM and strict ES2022,
types[], skipLibCheck=false NodeNext/Bundler checks. Installed graph is core/contracts/Zod only.

Runtime reference `146f7336a3e70412e764c07e566edcbf54803836`, exact Ghost inputs:
`packages/plugin-system/src/{event-emitter,capability-registry,capability-validation,compatibility}.ts`,
`packages/shell/src/plugin-activation-plan.ts`,
`packages/plugin-system/test/event-emitter.test.mjs`, and
`apps/shell/test/plugin-capability-registry.test.mjs`. No whole files were copied.
Emitter subscription/removal/fanout concepts were adapted with terminal disposal and exception
isolation. Registry validation/enablement concepts were rewritten with exact version/ambiguity
and provisional readiness. Compatibility characterization explicitly rejects interpreting the
canonical opaque version as Ghost's semver range. Planner ideas were rewritten: unlike the
source, self and missing edges cannot disappear, and downstream nodes are not mislabeled cycle
members. These are intentional non-equivalences, not a passing Ghost baseline claim.

Source docs remain `6169eb215dadbafd547096edef87240911648344`; local extraction plan/handoff
are uncommitted planning inputs, not fabricated SHA links. Implementation base is verified/pushed
`424eff39c9dcc2388aae78c25fc51f63ff8f1eff` in bd-created `worktrees/core`,
`feature/pylons-core`. Owner-approved MIT Copyright (c) Surikaterna applies to new/adapted owned
source; third-party terms are unchanged. The original proposal restoration checks remain intact.
