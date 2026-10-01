# Pylons

Portable, unpublished **0.0.0** contracts/core with independently installable HTTP
metadata and Module Federation factory adapters. The private three-host/two-tenant
demonstration composes those actual public APIs; it is not a bundled-plugin or RPC
substitute. Independent integrated release-candidate audit remains a separate stage.

Use `mise trust`, `mise install`, then `bun install --frozen-lockfile`.
Run `bun run typecheck` before a first clean build (workspace declarations), then
`bun run build` and `bun run demo -- --smoke` for a managed bounded smoke.
`bun run demo` serves the browser fixture on loopback port4040 and prints the
separate authoritative server URL. [Demo runbook](docs/demo.md) describes credentials,
fixtures, CLI sessions, controls, finite grants and D01–D09 automation.

Gates: `bun run lint`, `bun run typecheck`, `bun run test`, `bun test`,
`bun run build`, `bun run test:e2e`, `bun run verify:packages`,
`bun run test:demo`, `bun run test:demo:e2e`, `bun run test:demo:ui`,
`bun run test:demo:interactive`. Interactive demo supervision has no automatic
server kill timeout; finite authorization deadlines are separate from its lifetime.
Dedicated early feasibility/loader
regressions remain independent, not final-demo substitutes.

[Contracts](docs/contracts.md), [core](docs/core.md), [HTTP source](docs/source-http.md),
[loader](docs/loader-mf.md), [validation](docs/validation.md),
[provenance](docs/provenance.md), [instructions](AGENTS.md).
Canonical tracking remains in Ghost Beads; target Beads only wires worktrees.
MIT [license](LICENSE), `Copyright (c) Surikaterna`; third-party terms retained.

No registry publication/version application, PR/merge or Ghost adoption is claimed.
Packed local consumer overrides are development evidence, not registry resolution.
The existing initial MINOR changesets and independently verified core cancellation
PATCH retain future0.1.0 intent; all public package versions remain0.0.0.
