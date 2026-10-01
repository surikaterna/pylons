# Private early feasibility — armada-0wq76.3

This is the early gate, **not** the full two-tenant demonstration (.7), public core
(.4), HTTP adapter (.5), or productized loader (.6). No registry publication,
merge, PR, Ghost adoption, sandbox, full unload, version coexistence, production
trust, or reconciliation guarantee is established.

## Reproduce

Use `/home/sprawl/projects/pylons/worktrees/feasibility`, branch
`feature/pylons-feasibility`, based on verified/pushed contracts
`473c9cc8285e826014811727cfc021c0eec955d9`. There is no assumed main branch.

Run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`,
`bun run test`, `bun test`, `bun run build`, `bun run test:e2e`,
`bun run verify:packages`, `bun run test:feasibility:e2e`, and `git diff --check`.
The dedicated `build:feasibility` and `test:feasibility` scripts are also wired.
Build/e2e aggregates actually include the new harness; unit discovery includes
its metadata, logging, timeout, HTTP/cleanup, inventory and source-principles suites.

Exact pins: Bun1.4.2, TypeScript5.9.3, webpack5.106.2,
@module-federation/{enhanced,runtime,sdk}2.9.0, slf2.1.0,
slf-debug0.3.2, debug4.4.3, playwright-core1.63.0. @types/debug4.1.12 is
private development tooling. Automation executes programmatically through Bun
against `/usr/bin/chromium`, actually observed **152.0.7977.82**.
No Node application-runtime fallback or alternate evaluator is used.

## Build and transport boundary

One author implementation, `plugins/basic-validation/src/factory.ts`, is
transpiled independently and compiled by the real enhanced webpack plugin into
two physical containers. Named expose **`./factory`** exports named **`factory`**.
Browser uses a global container; server/CLI use `commonjs-module`.
LimitChunkCountPlugin forces one script per target; build rejects any extra
target output. `.feasibility-build/artifacts.json` pins their bytes/SHA256:

| Target | Bytes | SHA256 |
| --- | ---: | --- |
| browser/remoteEntry.js | 389298 | `7812b77681784b50868bd6b4040553d7081b186dd4e8f24f87814e1f7794fe8a` |
| bun/remoteEntry.js | 389291 | `fa6cd433ec57a3941aae72ea821f23a4f2aa08bce099ec0c20563174c8771185` |

`build-inventory.json` accounts for all six executable outputs (author
intermediate, two containers, three hosts), hashes them and records local
host import graphs. Graph walking rejects plugin-source/contracts-test edges;
emitted host scans additionally reject implementation markers. Hosts import
public contracts and private harness adapters, not plugin implementations or
contracts fakes. The fixture reads static metadata/artifact bytes only.

Domain data is parsed through the unchanged @pylons/contracts0.0.0 facade into
readonly definitions/plans. The single selected extension advertises validation
demand on server/browser/CLI. Admission checks known scope, revision coherence,
enablement, author/version, target/origin, bounded config and finite validity
before loading. Operator target/expose mapping remains private, not new public
MF fields. The fixture's 60-second validity is a test value, not a production SLA.

Each host uses exact runtime `createInstance/loadRemote`. Bun's private loadEntry
delegates to the pinned SDK `loadScriptNode`: its actual HTTP fetch hook validates
origin, status and SHA256 and returns a Response containing precisely those checked
bytes to SDK VM evaluation. There is no second unchecked fetch, local plugin import,
custom evaluator, container init or module-loading replacement. The narrow hook
supplies both the SDK's actual fetch/lifecycle fields and its declared createScriptHook.

Browser uses real MF script loading with native SHA256 SRI and anonymous CORS;
there is no prefetch/eval substitute. Chromium rejects wrong bytes before script
evaluation. All exposed executable code is inside the single pinned container.
Function/object guards narrow both the generated container and named factory.
These callable-shape guards rely on trusted generated implementations for behavior,
not a claim that an arbitrary function's semantics can be proven structurally.

## Actual execution evidence

E2e creates fresh Bun CLI/server processes and fresh Chromium contexts. It records
fixture response path/status/bytes separately from evaluation/activation/invocation
log markers. Every positive host fetches HTTP metadata before its container;
one executable response, one evaluation, one activation, two local invocations and
one cleanup are asserted. Server discovery occurs before demand with zero remote
downloads; the validation HTTP route joins one private session promise.

CLI exits 0 for valid `four`, 1 for invalid empty title, and 2 for infrastructure
rejection. Server/browser independently produce valid/invalid JSON results; neither
proxies plugin execution. Activation receives scoped generation/configuration,
registrar and owned resources. Each invocation receives its own local principal,
credential **reference**, transaction and neutral cancellation; no credentials are
captured in configuration or activation. This local fixture authority is not a
production authentication/authorization provider.

Negative Bun hash and disabled cases exit2 with no remote evaluation/activation;
disabled has only metadata transport. Fresh browser wrong-hash SRI also produces
zero remote evaluation/activation. Unit tests reject wrong scope/origin/target,
mixed revisions, finite expiry and malformed metadata/factory exports.
Metadata/executable transport has five-second timeouts; activation/invocation
boundaries are bounded. Basic cleanup begins every acquired resource's cleanup,
bounds each to five seconds, aggregates rejection/typed failure/timeout and closes
the registrar on failure/stop. This is not the future coordinator's complete race,
lease, draining, cancellation-subscription or hot replacement proof.

### HTTP failure and owned-server teardown — R1/R2

Auditor `01a0f452-0f0f-7261-a9cf-53948d6cef4f` found that rejected demand
prevented shutdown and that Bun's default request-error handler leaked the document
URL and raw stack. The earlier successful-path/redactor evidence did not cover that
failure boundary. This revision catches awaited request work in the private HTTP
composition boundary and installs a sanitized Bun error hook; neither reads/logs
the caught error or raw request. Startup failure also emits only a fixed code.

Infrastructure request failure returns HTTP503, exactly
`{"error":{"code":"request-failed"}}` (35 bytes). Failed shutdown returns HTTP503,
exactly `{"error":{"code":"shutdown-failed"}}` (36 bytes). Fixed-code facade
observations distinguish request, rejected activation and cleanup failure.
Shutdown closes admission, bounds settlement/cleanup to six seconds per boundary
and **always** schedules owned transport stop in finally, even if the cached demand
or cleanup rejects. HTTP503 and explicit safe failure observations are not swallowed;
server exit0 after shutdown means transport teardown completed, not validation success.

`scripts/feasibility-server-negatives.ts`, wired into both E2E commands, starts a
fresh **compiled production server** for wrong hash, executable HTTP503, executable
timeout, disconnected artifact origin, and cleanup rejection. Requests include
document/config query sentinels and an authorization-header sentinel. It asserts
exact bounded bodies, no sentinels/full request URL/raw stack in response or stderr,
safe failure observations, and natural process exit within two seconds after the
shutdown response, **without a forced kill on any passing case**. Timeout exercises
the real five-second boundary; absent response bytes are distinguished from started
requests. Pre-evaluation failures assert zero remote evaluation/activation.

The cleanup-only negative fixture deliberately perturbs two exact own-plugin
markers in generated container bytes, then pins the new SHA256 before serving them.
It does not execute code in the fixture, replace MF get/init/loading, alter positive
build artifacts, or substitute a fake for positive runtime proof. Its 389400-byte
Bun variant is pinned to
`532bdea8527b41c4470ee1a979e3b51363a7f2c6b951fad510f9664df1083288`.
The real provider first validates locally; owned cleanup throws a raw error sentinel,
and the final cleanup is still observed before sanitized failed shutdown/natural exit.
Unit regressions also cover all-attempt cleanup after throw, typed failure and timeout,
pending activation, rejecting cleanup, and actual facade middleware/pre-factory queue.

## Logging compatibility and honest quirks

Each root binds the actual slf-debug driver once. The plugin contains slf only,
not a backend; its messages therefore prove the remote facade reached the root
driver. Root `debug.enable("pylons:*")` affects that real backend. A fresh Bun probe
compares debug imported directly with debug resolved relative to slf-debug by
identity, and verifies actual resolved4.4.3, enable/disable and separate SLF threshold.
All hosts assert debug/info/warn/error output, queued-before-bootstrap replay, old
logger binding and remote cleanup. Programmatic counters are not inferred from logs.

Unmodified slf source accesses `global.__slf` and `process.env.SLF_LOG_LEVEL`.
The browser actually has neither global nor process; its root factory is a function.
Private lexical build substitutions map **global → globalThis** and only
**process.env.SLF_LOG_LEVEL → nonsecret "DEBUG"**. No process/env object shim,
broad Node polyfill, tenant factory switch, environment injection or logger replacement
is added. Source CJS default interop differs between Bun direct imports and bundling;
a runtime callable/object guard unwraps only the actual driver default.

The safe diagnostic adapter projects approved code templates and allowlisted opaque
correlation before calling the facade. The HTTP boundary separately submits only
fixed failure codes, never caught errors or requests. Sentinel tests inspect actual
middleware/pre-factory queue and the compiled server's failure response/stderr,
not a post-output redactor. These assertions cover the authored templates and the
explicit failure scenarios above; they are **not** blanket redaction of arbitrary
vendor output or trusted plugin code that bypasses the diagnostic policy. No raw
config/document/header/credential/error fields are submitted by these boundaries.

Observed quirks are intentionally retained, **not** lossless guarantees:
slf queues at most100 argument arrays; after capacity, further calls overwrite slot0
(105 calls leave queued-104 there). Binding replays and clears the queue; clearing
the factory clears queued entries. slf-debug consumes only the first event argument
of a multi-event factory call. `critical()` emits misspelled **CRITITAL**, not Critical.
The harness requires and verifies debug/info/warn/error, not repaired critical behavior.
Overflow/clear/threshold/multi-event characterization is a fresh Bun probe; the
browser additionally proves real root/remote binding and pre-bootstrap replay.

Pinned runtime-core's remote declaration omits the ResourceLoadContext import.
`tests/feasibility/vendor-context.d.ts` privately aliases its real fetch-hook type;
no any, assertion, vendor source patch, skipLibCheck or public declaration weakening.
Public packed strict ES2022/no-DOM NodeNext/Bundler checks remain separate and passing.
The contracts internal tsconfig explicitly pins ES2022-only lib rather than inheriting
the private tooling DOM lib. Root typecheck first emits strict contract declarations,
so a fresh worktree resolves the actual workspace export without stale dist outputs.

## Delivery boundary

All new manifests are explicitly allowlisted/private; contracts remains the sole
public package. No new changeset: only private harness/internal compiler isolation
changed, with no public runtime/API/manifest impact; the existing
contracts initial-minor changeset remains intact. Source rights are owner-approved
MIT Copyright (c) Surikaterna; third-party packages retain their own terms.
No substantive source commit/push before independent Auditor. Canonical evidence
and status remain on Ghost armada-0wq76.3; no duplicate target issue or new issue.

## Dedicated regression inputs during .7 composition

At .7 base `9c1eb16d6f11361863ab1eaa2949fa23e74d0ab2`, the early host
entrypoints/HTTP boundary and author factory were copied into
`tests/feasibility/apps/{web-server,browser,cli,fixture-server}` and
`tests/feasibility/plugins/basic-validation/factory.ts`. Their only source changes
are relative import/output paths. Original `apps/*` and `plugins/*` bytes remain
unchanged at this preflight boundary; they are not the final demonstration.
The feasibility build, graph and real-server negative runner now consume these
dedicated inputs. Host graphs reject both the original and copied plugin roots.
All original behavioral assertions remain. The copies retain the original
formatter exclusion; TypeScript and structural principle checks still inspect them.
The independent `.loader-build` inputs and runner remain unchanged.

Development MF output is path-sensitive: neither the former worktree nor former
input paths promise identical artifact bytes. At this exact demo worktree, before
retargeting, browser/Bun SHA256 were respectively
`9d57d3cdb719ebe1191793bab007f18b4a2ff42753c0bef6cf45e25ff41c65d0`
and `2d4469619b13e70f22351d91a619d6336548cbacd1ba91a1fae281b9318c7671`.
After retargeting, the actual browser container is 389291 bytes, SHA256
`9736a4e920876694a77a52f5d494c14bdebd877f7aa34d198db146612cf3d171`;
the Bun container is 389284 bytes, SHA256
`7ac5320a1856b642a15baa9b5784483b25de2fb6581b6f1fe5f2101b49920294`.
The independently repinned cleanup-negative Bun variant is 389393 bytes, SHA256
`9e4f110f7cf5daf22b2923a3c1e67af65f6b9ab0271c085016bc951bf47808f4`.
Real HTTP/hash/status/bytes, preferred root/remote logging and natural-exit
assertions were rerun, including all five server negatives. These are preserved
.3/.6 regression receipts, **not D01–D09 final-demo acceptance evidence**.
