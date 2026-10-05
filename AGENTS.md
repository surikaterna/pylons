# Pylons engineering instructions

Start with [agent handoff](docs/agent-handoff.md) for current source/review/tracking
and read-only onboarding. Incoming agents inherit no delivery or release authority.
Use Bun with the exact versions in mise.toml and package.json. No runtime fallback.
Implement only the assigned canonical issue; no publication, merge or Ghost adoption
without separate authorization. Public source is unpublished, not a runtime release.

Canonical tracking remains in Ghost:
`bd -C /home/sprawl/projects/ghost <command> --json`.
The independent local Pylons Beads database exists only for worktree infrastructure.
Never import Ghost's database or duplicate canonical issues here.

Use `bd worktree create worktrees/<name> --branch feature/<name> --json`.
Verify parent directories first. All substantive work belongs in that worktree.
GitFlow uses feature/* tasks, develop integration and main stable. Both main/develop
currently contain only the bootstrap seed: choose the owner-approved full-source
feature HEAD until integration, not an assumed default-branch implementation.
Compare root/worktree `bd context --json`: beads_dir, database, project_id and
Git common directory must match and differ from Ghost. With bd 1.2.2, a false
is_redirected flag is allowed only when shared identity is independently proven.

Follow docs/principles when present: cohesive files <=400 lines, functions <50
lines, nesting <=3, narrow types, no explicit any, unsafe assertions or default
exports. Comments explain intent. Tests are risk-based. UI must use semantic
tokens and accessible interaction. The foundation-stage absence of UI is historical;
the current private demo uses semantic Pylons tokens, not Ghost token adoption.

Run the gates documented in docs/validation.md. Use installed pinned tools,
never implicit latest downloads. Changesets apply only to publishable changes.
Preserve third-party terms and source provenance. Record evidence on the canonical
issue before Engineer implemented / Auditor verified / Diplomat in_review transitions.
No substantive commit or push before independent audit for armada-0wq76.1.
The same audit-before-substantive-delivery boundary applies to armada-9ado7.

Bootstrap exception: owner approved retaining the automatically generated
Beads infrastructure seed d34177ca331d3a077aedacedb45113aee307df0e and a minimal
AGENTS/.gitignore seed addition to enable isolated worktree implementation.
