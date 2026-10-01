# HTTP metadata source (.5)

Canonical **armada-0wq76.5** only; implementation candidate awaiting independent
Auditor, not a release or registry availability claim. Worktree
`/home/sprawl/projects/pylons/worktrees/source-http`, branch
`feature/pylons-source-http`, exact base
`5abc6113414f5fed86b712709e5bd49066b502f5`. See [provenance](provenance.md)
for setup, rights, source revisions and unchanged prior-stage scope.

## API and authority

The [package README](../packages/source-http/README.md) is the control-response
and recovery contract. Both source and context-bound catalog parse the existing
canonical ResolvedPlan, not a new envelope. Catalog returns only the requested
metadata with proof of scoped source/revision/config/authorization correspondence;
global unassigned definitions are deliberately not exposed without that proof.
Source metadata trust is separate from artifact admission. Mandatory injected
authorization/endpoint/transport/clock plus explicit byte/time/freshness bounds
have no allow-default or universal TTL. VerifiedContext comes from the host,
never arbitrary caller-supplied tenant names interpreted as authority.

No cache, denial cache or invalidation event exists. Recovery is caller reread.
Every read reauthorizes; callers retaining plans must honor both freshness and
authorization deadlines. Local latest-read tokens (full scope, authorization,
kind and reference lane), not revision lexical order, reject late completions.
Neutral root and optional fetch subpath have strict portable declarations.
Fetch-only internal compilation uses DOM definitions for actual fetch, but its
public declaration contains only the neutral HttpTransport return type.

## Validation coverage and commands

All commands run with pinned Bun1.4.2, TypeScript5.9.3, Biome2.4.13,
@types/bun1.4.0 and Changesets2.29.7. Existing webpack5.106.2/MF2.9.0,
slf2.1.0/slf-debug0.3.2/debug4.4.3 and playwright-core1.63.0 pins are preserved.
No Node fallback or logger substitution. Chromium is the actual installed
browser (verifier records version), not a publishable runtime dependency.

| Command | Coverage |
| --- | --- |
| `bun install --frozen-lockfile` | Compare lock SHA before/after; only new workspace records were added during approved initial install |
| `bun run lint` | Existing checks plus source/tooling/test Biome; exact three-public/six-private inventory; proposal restoration |
| `bun run typecheck` | Source ES2022/types[] strict noDOM root compilation, separate internal fetch compilation, existing profiles and tests |
| `bun run test` and `bun test` | Real HTTP/status/redirect/oversize/JSON/scope/revision/ref/trust/expiry/isolation/race/disconnect/cleanup plus prior suites |
| `bun run build` | Clean only owned tooling/contracts/core/source outputs; real JS/declaration compilation; unchanged private feasibility builds |
| `bun run test:e2e` | Prior compiled tooling/contracts gate, new compiled source ESM/mock/real HTTP, real three-host feasibility/logging |
| `bun run verify:packages` | Prior exact contracts/core profiles plus actual source/contracts tarballs and clean ESM/mock/HTTP/browser consumers |
| `bun run test:feasibility:e2e` | Dedicated unchanged three-host runtime/logger proof |
| `bun test tests/feasibility/logging.test.ts` | Fresh logger probe characterization |
| `git diff --check` | Tracked whitespace |
| `bun scripts/candidate-evidence.ts` | Tracked-modified and untracked candidate file hashes plus whitespace |

Risk-based additions include hostile declared/actual streamed size, fatal UTF-8,
malformed JSON, private payload/status redaction, wrong scope/ref/config/source/
authorization revisions, finite horizons and expiry crossed during transport,
revocation without cache fallback, opaque reverse-ordered revisions, concurrent
tenant/authorization lanes, mutation across awaits, late uncooperative work,
real HTTP supersession, caller/timeout underlying abort, premature TCP disconnect,
natural cleanup and independent throwing cleanup attempts. Production principles
AST tests check size/function/nesting, no any/assertions/default exports.

## Independent package proof and limits

Source0.0.0 runtime manifest depends only on exact contracts0.0.0; contracts
depends on exact Zod3.25.76. Actual installed graph is exactly these three
packages. Consumer-only sibling tarball override allows initial unpublished
contracts installation: **development evidence, not registry-resolved proof**.
Packed runtime manifests reject workspace/file/link references. Selected root
JavaScript traverses source/contracts/Zod-v3 only; fetch traverses two local
files. Strict NodeNext and Bundler consumers include both subpaths under
ES2022/types[]/skipLibCheckfalse with no DOM/Node/Bun/React/Weaver/MF/core/logger
declaration graph. Tar listings/hashes and complete closure paths are printed
by the verifier; temporary consumers/browser/server resources are owned and
cleaned in finally paths.

No frontend implementation exists (browser is a private test fixture), no
artifact request/loader usage is added, and no production trust SLA is claimed.
Origin/source authorization and grant renewal remain the composition root's
responsibility. Independent Auditor must verify every gate and candidate
fingerprint before any substantive commit/push. No later issue work is included.

## Engineer gate outcomes

All mandatory commands in the table exited0 on the final candidate run; full
stdout/stderr is captured in `/tmp/opencode/pylons-source-final-gates.log`.
Lint checked121 files. `bun run test` and `bun test` each passed224 tests,
0 failures,7777 assertions across28 files. Source-only real HTTP/deferred suites
passed44 tests,0 failures,89 assertions across4 files. Existing private .3
three-host E2E and its separate fresh logger probe also passed. Webpack prints
its inherited deprecation warnings; these are not a Node runtime substitution.

Frozen install preserved exact lock SHA256
`4878c7b51ab6f8ca43a38f4a824580206ee24ca132d16821c594a19db71bc15e`.
Initial lock delta is only10 lines for the new local workspace; vendor pins
and resolution records are unchanged. Prior contracts/core/app/plugin/feasibility
source and core-evidence diffs are empty.

Actual source tarball:19 files, SHA256
`df78b608f73966e8063104530e3772c1cb3ab348e245457abd4492c4953ed719`.
Contracts tarball:27 files, SHA256
`3975013f7bed36da1e41163ec99beb54dbabd47b494d4366c9caf3349d93c373`.
Preserved core tarball:45 files, SHA256
`b9827a979827e038166c998c2fd94fafa2b7e7fcab3fdf04b57761e654648dfa`.
Source installed graph has3 packages; strict NodeNext/Bundler declaration
closures each87 files; selected JS root23 files/fetch2 files. Packed actual
HTTP browser consumer passed on Chromium152.0.7977.82, with exactly1 metadata
request. Existing .3 artifact hashes remain browser
`7e990b3a49467a8e48a74de231768b94e7159d3f1e5fb920fb5b25882890969d`
and Bun `9fdcbba39ff2f8d2ba41ed3e3dacb9e8506589c4a2a76eb0e82a7361052804d3`.

Principles checks cover8 production source files and12 assigned tooling files:
maximum96 lines/file,39 lines/function, logical control nesting3 (else-if
alternatives are one level; nested functions are independently checked).
No any/type assertion/default export in these files. Remaining universal/TS
checks (cohesion, immutable narrow types, intent-only comments, bounded typed
failures and proportional tests) were manually reviewed. Frontend principles
are N/A to this metadata implementation. Only the preapproved Beads shared-
identity false-flag exception applies; no implementation principle waiver.

Supplemental filesystem Changesets release-plan API confirms source minor
0.0.0→0.1.0 with existing sibling minors retained. A first optional bare import
of its transitive helper was unresolved by Bun's isolated dependency layout;
rerun through its exact installed4.0.16 CJS/ESM wrapper passed. No new dependency,
version command or package publication was used. This does not weaken mandatory
gates or claim Git-based discovery of untracked changesets.

`candidate-evidence.ts` generalizes the name only: it preserves the existing
`core-evidence.ts` algorithm unchanged. Fingerprint is SHA256 over sorted
candidate relative paths, each UTF-8 path + NUL + lowercase SHA256 hex of exact
file bytes + LF. Candidate list is the deduplicated union of Git modified and
untracked/nonignored paths; generated outputs/dependencies are excluded. Exact
42-file list and fingerprint are recorded on canonical Beads at handoff rather
than embedded recursively in this candidate file.
