# Three-host, two-tenant private showcase — armada-0wq76.7

**Historical implementation-stage introduction below:** integrated `.8` audit and
source delivery have since completed; draft PRs now exist, not a release or merge.
See the [2026-10-05 agent handoff](agent-handoff.md) for the actual integrated
40b2071 baseline, current status and permissions. The operator contract remains.

Implementation candidate; independent integrated `.8` audit is required before
source delivery. No registry/version/PR/merge/Ghost adoption. Base source is
`9c1eb16d6f11361863ab1eaa2949fa23e74d0ab2`, plus verified armada-44vqo correction
(Auditor `01a0f574-161a-79b5-9027-491b6199a410`). Canonical status/evidence live in
Beads, not this runbook. Owned new source is MIT; existing provenance/specs retained.

## Build and run

```sh
mise trust
mise install
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run demo -- --smoke
bun run demo
```

Managed smoke exits naturally after actual A-valid/B-invalid server-local calls.
Interactive mode prints browser `http://127.0.0.1:4040/browser`, authoritative server
ephemeral URL, and CLI fixture origin. Ctrl+C stops owned runtime/transport/fixture
resources. Interactive supervision has NO automatic child kill deadline: the60s
grant limits authorization, not process lifetime. E2E clients separately select an
explicit bounded supervisor. Managed smoke performs finite work and shuts down
explicitly; its regression has an external5s test deadline, not a managed-child TTL.
If4040 is occupied, leave the other listener untouched unless its owner authorizes
stopping it. Automated checks use isolated loopback namespaces, not a port switch.
Do not expose this synthetic loopback fixture to production/network users.

## Try the browser

Open the printed `/browser` URL while `bun run demo` is running:

1. Select Tenant A, leave Alice selected, enter title `four`, and validate: **Valid**.
2. Select Tenant B and validate the same title: **Invalid** (minimum8 and reference required).
3. Load the long document fixture and validate B: **Valid**. Clear Reference and
   validate again: **Invalid**.
4. Refresh metadata to reread the selected tenant's inventory/configuration. This
   does not itself demand executable code or renew authorization.

Plugin cards foreground actual plugin IDs and states for **All tenants (A + B)** by
default. The native Lifecycle tenants filter can select the form tenant alone.
Expand a card for definition version, extension, generation ID, host/tenant scope,
and desired/applied revisions (`not applied` when absent). All retained generation
snapshots are listed, without claiming any row is current. Capability names come
from matching runtime contribution metadata (previously observed labels are retained
for that definition); unavailable metadata is explicitly labelled, not invented.
Metadata declarations are not executable code or readiness. Demand loads code and
activates scoped instances; blocked can also mean a real dependency block, not just
lazy demand. No raw configuration or error payload is rendered.

Discovery / source records actual typed plan/catalog outcomes with host completion
timestamps for both scopes. An initial failure has a source row, not invented
failed/absent plugin rows. `invalid-plan` alone cannot distinguish malformed from
expired metadata: guidance says **invalid or expired**, restart the rebuilt fixture
from this worktree and use its printed origin. Known authorization/unavailability/
catalog failures retain their original safe codes, alongside generic core warnings.
The timeline shows the last40 observed public lifecycle state/provider changes in
capture order, with actual generation IDs. This is a UI window, not host history
deletion or a current-selection claim. Host security is labelled host-provided.

The native labelled form selects tenant/session, title/reference and validates locally.
Keyboard Tab/Home/End/Enter works at320/1280px; semantic
Pylons CSS system-color tokens support light/dark schemes, no Ghost token adoption.
Document HTTP/network/non-200/malformed failures show only the fixed live status
`Document fixture unavailable.`; no raw error or unhandled rejection is published.
Per-view requests own cancellation, cancel superseded fetches and abort at shutdown.
Late/stale responses cannot change form fields, status or lifecycle DOM even when
a collaborator ignores cancellation. Other awaited UI results also check closure.

## Test the CLI in a second terminal

First complete the build above and keep `bun run demo` running in terminal1.
In terminal2, from the repository root, use its printed **cliOrigin** fixture URL,
NOT the ephemeral authoritative server URL. Typically:

```sh
ORIGIN=http://127.0.0.1:4040
```

Run each one-shot command separately; check `$?` immediately after each. Expected
process exit codes are shown in the comments (invalid/auth-failure are intentional):

```sh
bun run demo:cli -- "$ORIGIN" a-alice tests/demo/documents/short.json # valid, exit 0
bun run demo:cli -- "$ORIGIN" b-alice tests/demo/documents/long.json # valid, exit 0
bun run demo:cli -- "$ORIGIN" b-alice tests/demo/documents/short.json # invalid, exit 1
bun run demo:cli -- "$ORIGIN" invalid-token tests/demo/documents/short.json # exit 2
```

CLI exits0 valid,1 invalid,2 input/authentication/infrastructure/cleanup failure.
One-shot hosts always print per-plugin lifecycle summaries to stderr before/after
shutdown. Add `--diagnostics` anywhere in the argument list for detailed safe
source outcomes/event history/declared capabilities, including with `--session`:

```sh
bun run demo:cli -- --diagnostics "$ORIGIN" b-alice tests/demo/documents/long.json
```

Validation/discovery stdout still contains exactly one result. Input/authentication
rejection before host creation retains its original stderr-only exit2 behavior.
Failed initial discovery stops
before demand with `{"code":2,"error":"discovery-failed"}` and actionable stderr
guidance. It does not fetch executable code, renew authority, or discover a foreign
tenant just for diagnostics. Session `{"id":10,"op":"diagnostics"}` returns a
small safe projection; the advanced internal `report` also contains test logging
and remote traces and is not the browser/CLI diagnostics display. Session ready and
ID replies are unchanged; summaries are emitted at owned shutdown, not late events.
One-shot subprocesses are separate generations, NOT warm reuse evidence. In one
session, start:

```sh
bun run demo:cli -- "$ORIGIN" --session
```

Wait for `{"ready":true}`. Then enter **ONE JSON line at a time**, press Enter, and
wait for the reply with that ID before entering the next line below. Do not paste
the whole block expecting ordered execution: commands are dispatched concurrently
and replies may arrive out of order. `security` initializes the host credential policy,
not a third remote plugin. The first report shows metadata with no provider evaluation;
the last report shows reused instances and actual generation/revision/state fields.

```json
{"id":1,"op":"discover","tenant":"a"}
{"id":2,"op":"discover","tenant":"b"}
{"id":3,"op":"security","ready":true}
{"id":4,"op":"report"}
{"id":5,"op":"validate","token":"a-alice","document":{"title":"four"}}
{"id":6,"op":"validate","token":"b-alice","document":{"title":"four"}}
{"id":7,"op":"validate","token":"b-bob","document":{"title":"A long document title","reference":"REF-1"}}
{"id":8,"op":"report"}
{"id":9,"op":"shutdown"}
```

Validation replies for IDs5/6/7 contain `response.code`0/1/0 respectively. These are
per-request result codes, NOT the session process exit status. After the shutdown
reply, press **Ctrl+D** on an empty line to close stdin and exit the transport; a
clean session normally exits0 even if a validation reply was invalid. Cleanup or
infrastructure failure can make the process exit2. No forced kill
on passing cases. Same-process repeat/concurrent requests reuse factories but own
separate mutable scope instances and fresh principal/reference/transaction/cancellation.

Managed demo grants expire after **60 seconds**. Restart `bun run demo` for fresh
grants if testing takes longer. Browser Refresh metadata, a new CLI process, or
rediscovery alone cannot renew the fixture authority deadline. Config/operator
controls below are optional advanced tests, not prerequisites for this walkthrough.
Rebuild and restart from the new worktree to see updated UI/CLI diagnostics; an
already-running older demo retains its old compiled source and original deadlines.
No optional TTL extension or automatic renewal is included.

## Real APIs and authority

All roots use `createRuntime`, shared per-root `createVersionOwnership`, actual
`createHttpPlanSource`, `createHttpDefinitionCatalog`, `createFetchTransport` and the
chosen `createServerLoader`/`createBrowserLoader`. HTTP fixture metadata/catalog
endpoints return canonical ResolvedPlan and NEVER execute plugins. Browser/CLI do
not proxy validation to the server. Server independently reads its named document
fixture or accepts a bounded JSON document and invokes its own downloaded providers.

Synthetic credentials are `a-alice`, `a-bob`, `b-alice`, `b-bob`. Authority verifies
the token and derives tenant; body/query never grants authority. Server headers use
`Authorization: Bearer a-alice`. `/metadata` returns applicable contribution data;
`POST /validate` reauthorizes every guarded provider invocation. Invalid documents
return422 even when browser checks are bypassed; unauthenticated/wrong-tenant query
requests return401/403 without provider execution or foreign metadata disclosure.
`GET /fixture-validate?name=long` reads `tests/demo/documents/long.json` server-side.

External `credential-policy@1` host capability is an actually initialized synthetic
credential policy, not a third remote plugin. False readiness fails startup/protected
calls; true readiness never replaces per-call InvocationAuthority. AdmissionPolicy
checks scoped assignment/enablement; loader independently pins full definition,
binding, publisher/operator/origin, single-script profile and SHA before evaluation.
Metadata endpoint identity/context grants come from the root, not plan self-claims.

The operator-trusted `/operator/artifacts` map is generated from four actual
independently compiled single-script enhanced-MF2.9.0/webpack5.106.2 artifacts.
Containers `demo_basic_validation` and `demo_reference_required` are distinct.
Browser uses real native script/Blob/SRI; server/CLI use the real SDK under Bun1.4.2.
No Node runtime fallback/polyfill, custom evaluator or statically imported host plugin.

## Config, controls and finite policy

A selects `validation@1`, minimum3, never reference. B minimum8 additionally selects
`reference-validation@1` requiring readiness of validation. B base-only demand does
not download reference. Host explicitly invokes both capabilities: activation has
no invented provider-lookup API. Four-character/no-reference: A valid/B invalid;
long+reference: both valid; empty: both invalid; long/no-reference: B invalid due to
actual reference execution. Immutable factories may be shared; mutable instances
and replacement values remain scope/generation-owned.

Basic supports exact-revision atomic replacement; fail/mismatch do not advance
applied. Reference has NO replacement method: revision changes report restart-required.
The version2 negative fixture requests a competing definition/artifact identity
using the known bytes; it is NOT a delivered v2 release. Evaluated v1 ownership
rejects it before another request/evaluation; no hot reload/reservation clearing.
Disable/revocation withdraw even restart-required instances.

The private operator `/control` accepts JSON with `tenant`, `revision`, `values`,
`enabled`, `authorized`, `outage`, `until`, `version`; header `Bearer demo-operator`
is mandatory. Change fixture state, then refresh the relevant host. Example:

```sh
curl -H 'Authorization: Bearer demo-operator' -H 'Content-Type: application/json' \
  -d '{"tenant":"a","revision":"r2","values":{"basic-validation":{"minLength":8}}}' "$ORIGIN/control"
```

Library fixture controls additionally hold/release actual metadata/artifact/init
HTTP requests and inject503. Init modes `partial-fail`/`hold`, `ignoreCancel` and
`cleanupThrow` are private deterministic fault inputs. Terminal MF failures use
fresh process/browser realms; no unsafe version reservation clearing.

Fixture deadlines are explicitly issued once:10s in automated cases,60s managed
demo. Root metadata trust grant/horizon is65s, metadata transport1000ms/100KB;
core source/load/activation1500ms, policy/invoke/replacement/cleanup1000ms. These
are lab choices, NOT product defaults/production SLA. HostClock uses monotonic
epoch-coordinate native timers. Expiry tests set a short explicit deadline, prove
before-expiry last-good use and after-expiry denial during source outage. Source
unavailability never renews validity; a fresh host/operator grant is required later.

## D01–D09 actual automated evidence

`bun run test:demo:e2e` drives fresh CLI/server/browser roots for every scenario:

| ID | All-host evidence in runner |
| --- | --- |
| D01 | A/B canonical metadata/catalog, different graphs, zero executable requests/evaluation/activation |
| D02 | Real status/bytes/SHA responses, local results, A/B scoped activation; B base-only excludes reference |
| D03 | Two cold demand callers, one cancellation/survivor, zero subscriptions; repeats/concurrent calls no reactivation |
| D04 | All four document combinations, actual reference execution, changed users, unique request transactions/reference checks |
| D05 | Startup false/true/false, authoritative wrong-tenant guarded call; server401/403/422 bypass negatives; keyboard browser |
| D06 | Applied exact replacement vs failed/mismatched desired-only, absent reference replacement, explicit version conflict |
| D07 | Disable while restart-required; actual native deadline/outage/revocation and unaffected other scope |
| D08 | Real HTTP503 versus present metadata; partial-init failure cleans resources, required ref blocked, A unaffected |
| D09 | Throwing disposer/all attempts; shutdown during held HTTP read/load/init, late resource cleanup, no late readiness/result; natural exit |

Twenty-seven real-host scenarios plus actual CLI0/1/2 subprocess checks. Runner
prints snapshots/events, remote instrumentation and independent HTTP responses with
status/bytes/hash/timestamps, started requests and actual completion receipts.
Evaluation is honestly labelled `shared/module` because code factories are realm-wide;
activation/invocation/cleanup carry host/tenant/plugin/generation/desired/applied.
Counts come from actual instrumentation, NEVER debug-log parsing or scripted totals.
Late held-response records describe fixture-produced responses, not acceptance by a
closed caller. Snapshot readiness/publication assertions remain separate.

R1/R2 regressions: `bun run test:demo:ui` drives seven fresh compiled Chromium
cases (abort/HTTP503/invalidJSON/invalidshape/held-shutdown/suppressed-abort guard/
superseded response), with zero unhandled page rejections. It is included in
`test:demo:e2e`. R3: `bun run test:demo:interactive` runs the actual managed command
beyond12s, verifies live authenticated requests and local providers, then explicitly
signals shutdown and asserts nativeexit0/no signal termination, balanced resources,
zero timers and closed transports. This long regression is in root `test:e2e`, NOT
the fast unit command. Its30s watchdog is external test supervision only.

## Logging, cleanup and release limits

Actual slf2.1.0/slf-debug0.3.2/debug4.4.3 binds ONCE per root, never tenant-switches.
Both separately compiled facades reach root backend for evaluation/activation/invoke/
cleanup. Only lexical `global→globalThis` and nonsecret SLF_LOG_LEVEL=`DEBUG` are
substituted. Fixed safe codes/allowlisted bounded opaque correlation enter the facade
before middleware/prequeue. Tests inspect real bound params, queued arguments,
backend/stdout/stderr and public application HTTP bodies for sentinels. Authorized
private metadata wire payloads intentionally contain configuration sidebands; they
are not public action output/human logging and are NEVER printed in trace bodies.
Vendor/trusted publisher code can bypass authored sinks: no blanket redaction or
in-process sandbox claim. Loader has no logger; loader failures use its diagnostic
port through the root sink, not a fabricated facade proof.

Remote intervals/listeners/registrations are owned immediately, including partial
and late init; all cleanup is attempted after throw. Root UI listeners/subscriptions
are also owned. Shutdown closes core/security first, then drains/tears down owned
transport (server private operator `exit`, CLI EOF, browser context close). Passing
cases have native0 (CLI cleanup-failure2) or browser close with no retained Blob scripts.
Already evaluated code cannot be unloaded; noncooperative work cannot be forcibly
killed. Cleanup failure is a typed result, not readiness or validation success.

`.demo-build` is the ONLY owned deletion target of demo build; symlinks are refused
and tested. `.feasibility-build`/`.loader-build` remain independent. Private workspace
addition changes only lock workspace records, no vendor resolutions/pins. No new
changeset for private demo surfaces; the verified core PATCH/initial MINOR remain
unchanged. Mandatory root/dedicated gate outcomes, exact artifacts/graphs/tar hashes,
touched-path ledger and sorted-path/NUL/fileSHAhex/LF fingerprint are recorded in Beads.
