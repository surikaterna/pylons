# Private plain Bun CLI

Actual public runtime/source/server-loader composition. One-shot reads the supplied
document path, verifies credentials before discovery, executes locally and exits0/1/2.
`--session` accepts request-ID-tagged newline JSON, including concurrent calls/user
changes in the SAME process; separate launches are never called warm reuse.
Original early entry remains in `tests/feasibility/apps/cli`. See [runbook](../../docs/demo.md).
