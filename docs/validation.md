# Tooling and contracts validation (.2)

**Historical staged evidence:** the inventory/counts and pending-audit/no-PR
restrictions below are stage-local, not current integrated status. The
[2026-10-05 agent handoff](agent-handoff.md) gives the four-package source baseline,
current draft PR stack, required root gates and historical independent audit evidence.

The .6 extension is documented in [MF loader](loader-mf.md). Exact inventory is
now four public/six private manifests. Root lint/typecheck/unit gates include all
new loader source/tests/tooling; build adds `build:loader`, E2E adds
`test:loader:e2e`, package verification adds actual packed browser/server installs,
strict neutral selected declarations and real remote execution. Sibling profile
restrictions and private .3 proofs remain unchanged. Historical counts below
remain historical rather than assertions about the current inventory.

The .5 extension is documented in [HTTP source](source-http.md). Current exact
inventory is three public packages (contracts/core/source-http) and six private
manifests. All root gates include source tests/build/compiled ESM verification;
verify:packages additionally packs/installs source with contracts only and runs
strict neutral declarations and a real browser HTTP consumer. Historical stage
counts/descriptions below remain historical, not current inventory assertions.

The .4 extension is documented in [core](core.md): root lint/typecheck/test/build
and package verification include the new core and its own exact closure profile.
Public inventory is now contracts/core only; six root/private harness manifests
remain. Existing contracts-only consumer/profile and all private feasibility gates
remain in place. Core compiled consumers additionally install actual sibling tarballs
through a local consumer-only override, not a runtime manifest link or registry claim.
The historical .2/.3 descriptions below retain their original stage scope/counts.

The private .3 extension is documented in [feasibility](feasibility.md). Root
build/test:e2e now aggregate its real MF/three-host gates, lint/typecheck include
all private source, and unit discovery includes tests/feasibility. Exact private
workspace manifests are allowlisted individually; contracts remains the sole
public package. Public contracts source/manifests and packed no-DOM consumers are
unchanged; internal contracts tsconfig explicitly pins its existing ES2022-only lib,
and root typecheck emits those strict declarations before workspace consumption.
The historical .2 table below records that stage, not current counts.

Run in the contracts worktree with Bun **1.4.2**. TypeScript **5.9.3**, Biome
**2.4.13**, @types/bun **1.4.0**, development Changesets CLI **2.29.7** and the sole
package runtime dependency Zod **3.25.76** are exact-pinned in manifests/bun.lock.
Canonical evidence belongs on armada-0wq76.2; no final source commit/push before Auditor.

| Command | Actual coverage |
| --- | --- |
| `bun --version` | Exact project runner |
| `bun x --no-install tsc --version` | Installed exact compiler, no download |
| `bun install --frozen-lockfile` | Frozen resolution, compare lock SHA256 before/after |
| `bun run lint` | Actual tooling/test/contracts Biome plus bounded manifest inventory and unchanged proposal restoration/link checks |
| `bun run typecheck` | Strict tooling/tests/negative fixtures plus separate package ES2022/types[]/skipLibCheckfalse check |
| `bun run test` | Discoverable tooling/package/schema/port tests, invalid manifest/symlink/depth/budget/output/failure regression tests |
| `bun test` | Same discoverable actual unit suites, not an alias assumption |
| `bun run build` | Inventory check; remove only owned .foundation-build and contracts/dist; compile actual tooling and contracts JS/declarations; check outputs |
| `bun run test:e2e` | Compiled tooling valid/invalid fixture exits/cleanup and real compiled contracts ESM metadata/reusable-factory/two-scope invocation boundary |
| `bun run verify:packages` | Actual Bun pack; inspect exports/tar contents/hash; install in clean /tmp/opencode consumer; execute ESM; strict no-DOM NodeNext/Bundler type consumers; inspect installed runtime graph and selected JS/declaration closure; cleanup |
| `git diff --check` | Tracked whitespace |
| `git status --short` | Exact uncommitted assigned scope |

One private root manifest and **one** approved public-package manifest exist.
Inventory rejects all other nested manifests, symlinks and runtime workspace/file/link
references and bounds depth/entries. Only the exact contracts owned dist output is
excluded additionally (along with its exact managed node_modules directory); nested
lookalikes cannot hide manifests. The package exports
only its named ESM facade/declarations, no source/test or CJS public subpath.
Package outputs are emitted by installed tsc, not declaration shims or bundled third-party
source. Compiler scripts execute through Bun, never Node fallback.

Verifier consumer's *development-only* local tarball installation path is permitted;
packed/installed runtime manifests reject workspace/file/link edges. Consumer has no
workspace, ambient types or TypeScript dependency; the exact repository compiler is
invoked explicitly against it. Installed runtime graph is only @pylons/contracts and
Zod; selected Zod closure is v3. ES2022 lib, types[], strict and skipLibCheckfalse are
required in both module resolution checks. Real negative verifier fixtures exercise
manifest/graph/type/import/tar escapes and nonzero subprocess propagation, no skips.

Runtime test seams are injected fakes. E2e is compiled contracts boundary proof,
**not** MF, HTTP, browser, slf logging, an authorization/expiry engine or the three-host
demonstration. Local packing does not establish registry publication/availability.
No versioning, registry publication, PR/merge or Ghost adoption is authorized here.
Initial minor changeset records additive 0.1.0 intent; manifest stays unpublished0.0.0.
