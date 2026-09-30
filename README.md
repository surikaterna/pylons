# Pylons

Private root workspace with one public-package surface: **@pylons/contracts**, still
unpublished **0.0.0**, implemented for **armada-0wq76.2** on the verified foundation.
It contains strict data parsers and neutral injected lifecycle/adapter interfaces,
not a core runtime, transport, loader, executable plugin, browser or complete demo.

Use `mise trust`, `mise install`, then `bun install --frozen-lockfile`.
Run the real tooling/contracts gates described in [validation](docs/validation.md).
See [contracts API](docs/contracts.md) for schema ownership and intentional legacy divergences.
[Provenance](docs/provenance.md) records source paths, revisions, transformations,
license authority and setup exceptions. [Instructions](AGENTS.md) retain canonical
Ghost Beads issue IDs; the target database only supports local worktree infrastructure.

Other reserved directories contain responsibility READMEs, not dummy runtime packages.
Future graph: contracts ← core; contracts ← independently installed HTTP source
and MF loader; private host applications compose the chosen adapters.
MF/slf feasibility, three-host/two-tenant execution, finite trust/validity policy,
registry publication are **unproven future gates**. `verify:packages` packs an actual
Bun tarball and executes clean local ESM/no-DOM type consumers; that is not registry proof.

Proposals: [PRD](docs/architecture/plugin-runtime-0.1-prd.md),
[ARB](docs/architecture/plugin-runtime-0.1-arb.md),
[future discussion](docs/architecture/plugin-runtime-future-directions.md).
They retain Ghost terminology and identifiers; transfer is not acceptance or adoption.
Owner-approved source/new foundation license: [MIT](LICENSE),
exact notice `Copyright (c) Surikaterna`. Third-party dependencies keep their own terms.
