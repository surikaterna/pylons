# Pylons engineering instructions

Use Bun with the exact versions in mise.toml and package.json. No runtime fallback.
Implement only the assigned canonical issue; no publication, merge or Ghost adoption
without separate authorization. Current foundation is private, not a runtime release.

Canonical tracking remains in Ghost:
`bd -C /home/sprawl/projects/ghost <command> --json`.
The independent local Pylons Beads database exists only for worktree infrastructure.
Never import Ghost's database or duplicate canonical issues here.

Use `bd worktree create worktrees/<name> --branch feature/<name> --json`.
Verify parent directories first. All substantive work belongs in that worktree.
Compare root/worktree `bd context --json`: beads_dir, database, project_id and
Git common directory must match and differ from Ghost. With bd 1.2.2, a false
is_redirected flag is allowed only when shared identity is independently proven.

Follow docs/principles when present: cohesive files <=400 lines, functions <50
lines, nesting <=3, narrow types, no explicit any, unsafe assertions or default
exports. Comments explain intent. Tests are risk-based. UI must use semantic
tokens and accessible interaction; no UI exists in the foundation stage.

Run the gates documented in docs/validation.md. Use installed pinned tools,
never implicit latest downloads. Changesets apply only to publishable changes.
Preserve third-party terms and source provenance. Record evidence on the canonical
issue before Engineer implemented / Auditor verified / Diplomat in_review transitions.
No substantive commit or push before independent audit for armada-0wq76.1.

Bootstrap exception: owner approved retaining the automatically generated
Beads infrastructure seed d34177ca331d3a077aedacedb45113aee307df0e and a minimal
AGENTS/.gitignore seed addition to enable isolated worktree implementation.
