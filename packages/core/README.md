# @pylons/core

New scoped neutral lifecycle coordinator under canonical armada-0wq76.4.
Unpublished ESM and strict ES2022 declarations, version 0.0.0; no CJS promise.
The only runtime package dependency is exact @pylons/contracts 0.0.0.

`createRuntime` requires a verified scoped context, source, loader, admission
policy, per-call authoritative authorization, clock, observer, diagnostics,
explicit operation bounds, supported contribution kinds, host providers, a shared
`createVersionOwnership()` owner for its process/module cache, and
security startup capability requirements. No permissive policy or clock default.

`refresh`, `metadata`, `startup`, `demand`, guarded `invoke`, `snapshots` and
`shutdown` do not return raw provider handles. Activation does not receive
request credentials; each invocation supplies its own context. Opaque versions
and revisions use equality, not semver ranges or lexical ordering.

This is trusted in-process coordination, not a sandbox, unload guarantee,
distributed transaction, source resolver or action dispatcher. Noncooperative
plugin promises cannot be killed. Local packaging is not registry publication.
Source delivery remains subject to independent audit; do not adopt in Ghost.
See the repository's docs/core.md for planner semantics, ownership, limits and proof.
