# Foundation provenance

Canonical issue **armada-0wq76.1**; planning armada-9jpyz; epic armada-0wq76.
This is the private foundation, not a runtime extraction/release or accepted architecture.
The user approved public surikaterna/pylons, cloning/setup, pinned tooling installation,
MIT reuse of owned Ghost-origin/new source and source Git delivery. Final substantive
commit/push is held for independent Auditor; registry publication, PR, merge and Ghost
adoption are not authorized by this stage.

## Rights and third parties

Owner supplied the exact notice **Copyright (c) Surikaterna**, retained in LICENSE
and transferred proposal attribution without an invented person, year or legal entity.
MIT applies to approved owned Ghost-origin/new foundation material. Third-party
dependencies and generated Beads infrastructure retain their own terms; root MIT
does not purport to relicense them. No third-party source was extracted or modified.

## Copied material and transformations

Documentation revision: `6169eb215dadbafd547096edef87240911648344`.
Every row has the same original and target `docs/architecture/<filename>` path.

| Filename / full-SHA source | Original SHA256 | Transformations |
| --- | --- | --- |
| [plugin-runtime-0.1-prd.md](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-runtime-0.1-prd.md) | `2d77757d2adc09ab3d5c1c828d35d87c3853e9b44732d3569081a9f7ac0498a2` | Add three-line attribution after title; historical proposal link becomes pinned blob |
| [plugin-runtime-0.1-arb.md](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-runtime-0.1-arb.md) | `c8935c7f0ef87631c51ca5c7eb5c22eb9319ed90c7f9374f8c179371387d7571` | Same attribution; two historical-proposal links (one with anchor), inventory, boundaries and Weaver links become pinned blobs |
| [plugin-runtime-future-directions.md](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-runtime-future-directions.md) | `609802ae961b4f653ce2c8b75d0d1d20decd674050750fa86125db1710bd08e0` | Same attribution; historical proposal, Weaver, multi-target and boundaries links become pinned blobs |

Companion links between the three copied files remain local, including the ARB
logging anchor. Proposed statuses, issue IDs, FR/AC/AR/D identifiers, branding,
dates, traceability and requirement text are unchanged. External evidence links,
including expressly mutable registry observations, remain unchanged.
`scripts/provenance.ts` reverses only the exact attribution/pinned-link conversions
and requires byte-identical original hashes; it also checks local files/anchors.

Uncopied references, verified against the documentation Git object:
[historical proposal](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-runtime-0.1-proposal.md)
(including `#existing-package-evidence`),
[inventory](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-contract-and-plugin-inventory.md),
[boundaries](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/plugin-envelope-host-deployment-boundaries.md),
[multi-target](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/multi-target-architecture-assessment.md),
[Weaver assessment](https://github.com/spralle/ghost/blob/6169eb215dadbafd547096edef87240911648344/docs/architecture/weaver-change-notification-assessment.md).

Runtime evidence baseline: `146f7336a3e70412e764c07e566edcbf54803836`;
[contracts manifest reference](https://github.com/spralle/ghost/blob/146f7336a3e70412e764c07e566edcbf54803836/packages/plugin-contracts/package.json).
**No runtime files were copied, adapted or removed in .1.**

## Inputs not copied

Local source worktree `/home/sprawl/projects/ghost/worktrees/plugin-host-boundaries`:
`docs/architecture/pylons-extraction-plan.md` and `pylons-sol-handoff.md` are
uncommitted planning inputs, **not files available at the documentation SHA**.
They are deliberately not represented by fabricated GitHub links or copied here.
Their status is canonical planning evidence, not architecture acceptance.
Source `AGENTS.md`, `docs/principles/{universal,typescript,frontend,ghost}.md`,
inventory and host-boundary assessments informed the new target instructions and
scope; no wholesale instruction/database transplant. New root configs, tooling,
tests, READMEs and this evidence are original foundation material, not runtime reuse.

## Local bootstrap and isolation

The initially empty public remote has no default branch or remote heads yet.
bd 1.2.2 init automatically committed nonproduction infrastructure as
`d34177ca331d3a077aedacedb45113aee307df0e`; the owner/Builder explicitly approved
retaining that inspected seed as a setup exception after it was reported.
Only reviewed AGENTS/.gitignore additions were explicitly committed next as
`ddd30b9e764bc1340cc754681c453d226f2276ea` on feature/pylons-bootstrap.
No substantive implementation was committed in the root or pushed.
`bd worktree create worktrees/foundation --branch feature/pylons-foundation --json`
returned `/home/sprawl/projects/pylons/worktrees/foundation`, the only implementation
location. HEAD remains the second seed while this stage awaits independent audit.

Target root/worktree share `/home/sprawl/projects/pylons/.beads`, database `pylons`,
project_id `36335d99-363b-4c08-8c59-db35e9d2cf7a`, common Git directory
`/home/sprawl/projects/pylons/.git`. Root is_worktree=false; worktree=true;
is_redirected=false in both is the approved bd1.2.2 shared-identity exception.
Ghost has separate `/home/sprawl/projects/ghost/.beads`, database `armada`,
project_id `088b6c64-d77e-4936-98da-901609ddc0a0`; no import/duplicate issues.
All issue mutations use canonical `bd -C /home/sprawl/projects/ghost ... --json`.
Generated hook/config/database files were inspected; no credential/database files
were committed. Hooks are not bypassed; no Dolt/Git synchronization is claimed.
Root worktree creation introduced no hidden ignore delta because /worktrees/
was already reserved. Generated infrastructure remains as approved, not runtime code.

No changeset: root is private/nonpublishable, and reserved paths have no manifests.
The next .2 issue remains separate; future publishable changes need reviewed changesets.
