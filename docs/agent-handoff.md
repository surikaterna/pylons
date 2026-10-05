# Pylons-local agent ownership handoff

Owner-assigned documentation task **armada-9ado7**. Status checked **2026-10-05**;
this is an onboarding snapshot, not authority to start implementation or a release.
Read [AGENTS](../AGENTS.md), [README](../README.md), [provenance](provenance.md),
[validation](validation.md) and [demo runbook](demo.md) before acting.

## Source and current review truth

The integrated, independently audited source baseline is
[`40b2071321982aede2e0afc9b27336b3998f82fc`](https://github.com/surikaterna/pylons/commit/40b2071321982aede2e0afc9b27336b3998f82fc),
on `feature/pylons-demo-diagnostics`. Local clean source HEAD and remote branch
matched on the date above. This handoff is NEW documentation on
`feature/pylons-agent-handoff`, in
`/home/sprawl/projects/pylons/worktrees/agent-handoff`, created from that baseline.
At preparation its HEAD is the baseline and its docs are uncommitted, awaiting
independent audit. After authorized delivery, its actual HEAD will include these
docs atop that source; obtain it with `git rev-parse HEAD`, not a guessed future SHA.
The docs branch has no upstream yet at preparation; that absence is expected only
before delivery. Do not claim this handoff has already been pushed or audited.

GitHub default branch is **develop**. Both `main` and `develop` still point to seed
`ddd30b9e764bc1340cc754681c453d226f2276ea`; neither contains the implementation.
GitFlow intends stable `main`, integration `develop`, and task branches `feature/*`.
Currently select the full integrated feature source, not the default/seed checkout.

| Current draft review | Head | Base | State checked |
| --- | --- | --- | --- |
| [PR #2: foundation](https://github.com/surikaterna/pylons/pull/2) | `feature/pylons-foundation`, `50214bf41420e56f38264194ab3446443fde1254` | `develop` | OPEN, draft |
| [PR #1: project shape](https://github.com/surikaterna/pylons/pull/1) | `feature/pylons-demo-diagnostics`, `40b2071321982aede2e0afc9b27336b3998f82fc` | `feature/pylons-foundation` | OPEN, draft |

Review foundation #2 before integrated #1. Retarget #1 to `develop` ONLY after an
authorized foundation merge and fresh verification; no automatic retarget or merge.
After integration, new GitFlow feature work normally targets `develop`. Until then,
ask the owner for the correct chosen full-source base. Recheck refs and PR state;
stop/report unexpected drift rather than silently changing the assigned baseline.

Read-only remote probes (credentials provide capability, not permission):

```sh
git -C /home/sprawl/projects/pylons ls-remote origin refs/heads/main refs/heads/develop refs/heads/feature/pylons-demo-diagnostics refs/heads/feature/pylons-agent-handoff
gh repo view surikaterna/pylons --json defaultBranchRef
gh pr view 2 --repo surikaterna/pylons --json state,isDraft,headRefOid,headRefName,baseRefName,url
gh pr view 1 --repo surikaterna/pylons --json state,isDraft,headRefOid,headRefName,baseRefName,url
gh pr checks 2 --repo surikaterna/pylons
gh pr checks 1 --repo surikaterna/pylons
gh api repos/surikaterna/pylons/actions/workflows
gh run list --repo surikaterna/pylons --limit 5 --json databaseId,status,conclusion,headSha
```

Actual probes returned no PR checks, zero workflows and no runs. `gh pr checks`
returns nonzero when no checks are reported: this is **absent hosted CI**, not a
passing or failing hosted suite. Local independent audit is separate evidence.

## Implemented package boundaries and retained history

Four independently installable public packages, all unpublished **0.0.0**:

| Package | Runtime dependency boundary |
| --- | --- |
| `@pylons/contracts` | Neutral contracts/parsers; exact Zod3.25.76, selected `zod/v3` closure |
| `@pylons/core` | Neutral lifecycle coordinator; contracts only, no MF/vendor runtime |
| `@pylons/source-http` | HTTP plan/catalog metadata source; contracts only; no executable loading |
| `@pylons/loader-mf` | Selected browser/server MF factory adapters; contracts + runtime/SDK2.9.0 |

No Ghost dependencies. Neutral contracts/core remain vendor-runtime-free (contracts
has the explicit schema dependency above). Private three-host/two-tenant demo uses
actual APIs, HTTP metadata and actual remote execution in browser, server and CLI;
it is not a prototype-only claim, bundled-plugin substitute or browser/CLI RPC proxy.
Private early `.3` feasibility and `.6` loader proofs remain independently valuable.
See [contracts](contracts.md), [core](core.md), [HTTP source](source-http.md),
[MF loader](loader-mf.md) and [feasibility](feasibility.md) for bounded contracts.

Ghost source remains retained: no adoption, copied Git history, wholesale relocation
or tracking migration. MIT notice is exactly **Copyright (c) Surikaterna**;
[LICENSE](../LICENSE) and dependency terms remain intact. Runtime reference revision
is `146f7336a3e70412e764c07e566edcbf54803836`; documentation reference revision is
`6169eb215dadbafd547096edef87240911648344`. [Provenance](provenance.md) retains full-SHA
links, selective adaptations and the exact three-proposal restoration table.
Transferred architecture documents remain **proposed**, attributed modified
references, not accepted implementation specifications or rewritten history.

Lifecycle states/events and retained generations are real observations; metadata
is not readiness. Evaluated code cannot be fully unloaded; cooperative resource
ownership is not an in-process sandbox or force-kill guarantee. Source outage never
renews authorization or validity. Preserve admission, cancellation and generation
boundaries rather than weakening them to simplify a demo.

Four initial MINOR changesets plus the core cancellation PATCH remain unapplied,
with future0.1.0 intent. No registry availability/publication, version application,
deployment or release acceptance is claimed. Actual packed clean consumers used
**consumer-only local tar overrides**; that proves local graph/closure, not registry
resolution. Changesets compares against `main`; `main` now exists but remains the
seed, so inspect actual comparison/release plan and branch policy before any
owner-authorized version/dependency/publication work. No Vite/build-system swap is
requested. CI, branch policy, release dependency/version decisions and publishing
are owner-held followups, not tasks authorized by this document.

## Tracking and permissions: read-only first

Canonical tracker remains **Ghost**. Use only
`bd -C /home/sprawl/projects/ghost <command> --json` for canonical issues.
On 2026-10-05 actual statuses for `armada-0wq76.1`–`.8`, `armada-44vqo`,
`armada-vfjgk`, `armada-fm9n7` and `armada-okuz3` are **in_review**;
their prior independent verified/source-delivery evidence is retained. The epic
`armada-0wq76` is open. Historical notes saying verified/not in_review or no PR
describe earlier stages, not current tracker state. `armada-9ado7` is this docs
task; consult its actual status for the handoff audit/delivery stage.

```sh
bd -C /home/sprawl/projects/ghost context --json
bd -C /home/sprawl/projects/ghost show armada-9ado7 --json
bd -C /home/sprawl/projects/ghost show armada-0wq76 --json
bd -C /home/sprawl/projects/ghost show armada-okuz3 --json
bd -C /home/sprawl/projects/ghost comments armada-okuz3 --json
```

Read relevant `.1`–`.8` and correction issues using the same absolute command.
Pylons Beads is **worktree infrastructure only**, currently empty (`bd list --json`
returned `[]`). Do not duplicate canonical issues, initialize an isolated database,
import/transplant Ghost's database, or migrate tracking without explicit owner
approval and an explicit issue mapping. Do not select queued work automatically;
obtain the owner's assigned issue and bounded scope first.

Incoming agents do NOT inherit previous commit/push, PR creation, merge, versioning,
registry publication, deployment or Ghost adoption authority. Working credentials
are not consent. Read-only orientation first; then separate the owner's assigned
implementation scope, allowed setup/quality gates and restricted mutations.
This docs task permits only handoff/reconciliation documentation; substantial
commit/push is held until independent audit under existing written source-delivery
scope. No new PR, merge, release or issue closure is authorized here.

## Start on this host or in a fresh clone

Same host: use the handoff worktree above, once delivered containing baseline plus
docs. Inspect before editing, preserve existing changes and consult the owner on
unexpected dirty/index state, missing upstream after delivery or ref drift:

```sh
pwd
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff status --short --branch
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff diff --check
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff diff --cached --stat
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff rev-parse HEAD
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
git -C /home/sprawl/projects/pylons rev-parse --path-format=absolute --git-common-dir
git -C /home/sprawl/projects/pylons/worktrees/agent-handoff rev-parse --path-format=absolute --git-common-dir
bd -C /home/sprawl/projects/pylons context --json
bd -C /home/sprawl/projects/pylons/worktrees/agent-handoff context --json
bd -C /home/sprawl/projects/pylons list --json
```

Root/worktree must share `/home/sprawl/projects/pylons/.beads`, database `pylons`,
project_id `36335d99-363b-4c08-8c59-db35e9d2cf7a`, Git common directory
`/home/sprawl/projects/pylons/.git`. Root is_worktree=false; handoff worktree=true.
Both is_redirected=false: this is the documented, owner-approved bd1.2.2 exception
ONLY with independently matching shared identities, not blanket approval.
Ghost is distinct: `/home/sprawl/projects/ghost/.beads`, database `armada`,
project_id `088b6c64-d77e-4936-98da-901609ddc0a0`. Report only sanitized identity
evidence; never copy database contents, private credentials or environment secrets.

Fresh clone: after owner permission for setup, verify the destination parent and
remote branch availability first, then explicitly select the delivered docs branch:

```sh
git ls-remote https://github.com/surikaterna/pylons.git refs/heads/feature/pylons-agent-handoff
git clone --branch feature/pylons-agent-handoff https://github.com/surikaterna/pylons.git <approved-destination>
```

Do not silently fall back to `develop` if the handoff branch is not yet available.
The Ghost canonical database is outside this repository and will not appear in a
fresh clone. If canonical tracking, pinned tools or worktree infrastructure is
unavailable, STOP and request owner context/capability; do not fabricate issues or
initialize/import a replacement database. Re-evaluate host-specific paths/identity
with the owner instead of assuming a fresh host shares these local identities.

After explicit permission for new implementation, use a new `feature/*` worktree
from the owner-chosen actual full-source HEAD. Verify clean status/index, local
HEAD/remote/upstream, parent directories and branch uniqueness first; invoke from
that chosen base worktree (absolute destination avoids bd's cwd-relative paths):

```sh
ls /home/sprawl/projects/pylons/worktrees
bd worktree create /home/sprawl/projects/pylons/worktrees/<assigned-name> --branch feature/<assigned-name> --json
```

Verify returned path/HEAD and root/worktree Beads/common-Git identities before
claiming the canonical issue or editing. A newly created undelivered task branch
normally has no upstream; record that expected exception, never initialize a DB
to fix an upstream error. Unexpected absence on a delivered branch requires a stop.

## Pinned tooling and required runtime-change gates

Only after setup/gate permission, from the selected worktree:

```sh
mise trust
mise install
bun --version # must be 1.4.2
bun install --frozen-lockfile
bun x --no-install tsc --version # must be 5.9.3
bun run lint
bun run typecheck
bun run test
bun test
bun run build
bun run test:e2e
bun run verify:packages
git diff --check
git status --short --branch
```

Frozen install must not change `bun.lock`. Typecheck precedes the first clean build
to emit workspace declarations. Both unit commands are required, not assumed
equivalent. Root build includes foundation, feasibility, loader and demo; root E2E
includes actual HTTP/MF three-host, D01–D09, UI/clarity/diagnostics and interactive
proofs. Dedicated commands remain in [README](../README.md) and package scripts.
No implicit latest downloads, Node fallback or gate weakening.

Never kill/restart/control someone else's active demo on4040. Where authorized,
validate user/network namespace capability for owned E2E, then isolate loopback:

```sh
unshare --user --map-root-user --net sh -c 'ip link set lo up && ip link show lo'
unshare --user --map-root-user --net sh -c 'ip link set lo up && bun run test:e2e'
```

No persistent network config, credentials or Git mutations in the namespace. If
capability is unavailable, report a blocked gate; do not waive or fake a pass.

Historical independent baseline evidence, NOT rerun by this docs task: Auditor
receipt `01a0f697-1a5f-781c-9877-7dd28dff067e` on `armada-okuz3` records lint198,
both unit commands287tests/8512assertions, typecheck/build/packed consumers and full
isolated root E2E PASS. `.3`/`.6` actual HTTP/MF three-host and D01–D09 remain covered.
The latest diagnostics21-path fingerprint is
`c3cd51542d6fce9928a255e13d78bafe816c74d1141528bcf3b943d5ab5b44e4`
(sorted UTF-8 path + NUL + lowercase file SHA256 hex + LF; no deletions).
Delivery receipt `01a0f6a8-b730-7c99-8590-fef7b042241c` pins that evidence to baseline
40b2071; later PR delivery changes tracker state, not historical test results.
Docs-only checks are separate evidence and do not assert a fresh runtime pass.

## Demo operator essentials

With permission to run an owned demo, build first (`bun run typecheck`, then
`bun run build`), then `bun run demo`; managed smoke is `bun run demo -- --smoke`.
Use the printed browser URL and **cliOrigin fixture**, NOT the separate ephemeral
authoritative server URL. Second terminal, same selected worktree:

```sh
ORIGIN=http://127.0.0.1:4040 # use the actual printed cliOrigin
bun run demo:cli -- --diagnostics "$ORIGIN" b-alice tests/demo/documents/long.json
bun run demo:cli -- "$ORIGIN" --session --diagnostics
```

One-shot summaries for all known plugins go to stderr before/after owned shutdown;
diagnostics adds safe source outcomes/history/capabilities, not raw config/errors.
Validation/discovery stdout is one JSON result; exit0 valid,1 invalid,2 failure.
Input/auth rejection before host creation stays stderr-only exit2. Failed initial
discovery returns `{"code":2,"error":"discovery-failed"}` before code demand.
`invalid-plan` alone means **invalid or expired**, not proof of expiry.
Session: wait for ready, send one JSON line and wait for its ID reply; use
`{"id":10,"op":"diagnostics"}` for safe diagnostics, shutdown then Ctrl+D.

Managed grants are fixed **60 seconds**. Metadata refresh, rediscovery or a new CLI
does not renew them; restart only your owned rebuilt demo for fresh grants. An old
process retains old compiled code/deadlines. No TTL extension, automatic renewal
or source-validity weakening. Lifecycle rows retain actual states/generations;
UI windows are not deletion of host history. [Demo runbook](demo.md) is the detailed
operator/test contract. Owner controls any existing user demo; leave it untouched.

## Next ownership action

Auditor independently checks this docs-only candidate, preserved history, links,
current refs/PR/tracker truth and exact path/hash ledger before source delivery.
Then the owner chooses review/release followups and assigns the next bounded task.
No inherited delivery or adoption authority, automatic queue triage or release.
