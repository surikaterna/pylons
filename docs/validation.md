# Foundation validation (.1)

These gates execute real **foundation tooling**, not the future plugin demo.
Run from the isolated foundation worktree with Bun 1.4.2. package.json pins
TypeScript 5.9.3, Biome 2.4.13 and @types/bun 1.4.0; bun.lock records transitive
resolution and integrity. No runtime/version fallback, MF or slf dependencies.

| Command | Real bounded coverage |
| --- | --- |
| `bun --version` | Exact runner version |
| `bun x --no-install tsc --version` | Installed pinned TypeScript, no network acquisition |
| `bun install --frozen-lockfile` | Install from committed-intent lock; compare hash before/after |
| `bun run lint` | Installed Biome on tooling/tests; root private/exact-pin/script policy; proposal hash-restoration and local link/anchor checks |
| `bun run typecheck` | Strict tsc across actual tooling/tests, including unchecked indexing and exact optionals |
| `bun run test` | Explicit discoverable tooling suite: negative manifest/link/JSON/symlink fixtures and subprocess failure propagation |
| `bun test` | Same discoverable unit coverage, no hidden alternative suite |
| `bun run build` | Validate inventory, clean only owned .foundation-build, compile actual TS tooling using installed tsc, verify JS/declaration files |
| `bun run test:e2e` | Requires build; real Bun subprocesses execute compiled inventory tool on valid/invalid temporary fixtures; assert exits/output and clean up |
| `bun run verify:packages` | Walk actual manifests, private root policy, reject unexpected nested private/publishable manifests and workspace/file/link runtime references |
| `git diff --check` | Tracked whitespace check; added-file checks independently covered in audit evidence |
| `git status --short` | Review exact uncommitted scope and no staged substantive files |

Successful package inventory is **one private root manifest, zero publishable
packages; packing N/A (.1)**, not successful runtime tarball/consumer proof.
Inventory skips Git/Beads/dependency/worktree/owned build infrastructure, rejects
symlinks, and bounds traversal. Compiled e2e is not browser, HTTP plugin, MF/slf,
tenant lifecycle or three-host/two-tenant proof. These remain future stage gates.
All script tools resolve installed pins; ordinary `bun run` uses local .bin entries.
Typecheck/build explicitly execute installed TypeScript with Bun, not a Node fallback.
Build emits tooling ESM/declarations into ignored .foundation-build only.

Quality evidence belongs on canonical armada-0wq76.1, including earlier failed
iterations and final outcomes. Independent Auditor must rerun all gates and inspect
provenance, instructions, zero-runtime inventory, build ownership and source preservation.
No substantive commit/push until that audit; no registry publish, PR, merge or adoption.
