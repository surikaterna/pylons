# Private plain Bun CLI

Actual public runtime/source/server-loader composition. One-shot reads the supplied
document path, verifies credentials before discovery, executes locally and exits0/1/2.
`--session` accepts request-ID-tagged newline JSON, including concurrent calls/user
changes in the SAME process; separate launches are never called warm reuse.
Original early entry remains in `tests/feasibility/apps/cli`. See [runbook](../../docs/demo.md).

Quick start: build with `bun run build`, keep `bun run demo` running, and open a
second terminal in the repository root. Set `ORIGIN` to the printed `cliOrigin`
(typically `http://127.0.0.1:4040`, not the authoritative server URL):

```sh
ORIGIN=http://127.0.0.1:4040
bun run demo:cli -- "$ORIGIN" a-alice tests/demo/documents/short.json
bun run demo:cli -- "$ORIGIN" b-alice tests/demo/documents/long.json
bun run demo:cli -- "$ORIGIN" b-alice tests/demo/documents/short.json
bun run demo:cli -- "$ORIGIN" invalid-token tests/demo/documents/short.json
```

Run separately: expected exits0,0,1,2. For `bun run demo:cli -- "$ORIGIN" --session`,
wait for the ready line, then send one JSON line and wait for its reply before the
next. Dispatch is concurrent, not paste-order serialized. Follow the exact
[discover/security/report/validate/shutdown sequence](../../docs/demo.md#test-the-cli-in-a-second-terminal).
Session `response.code` is a request result, not process exit status. Ctrl+D on an
empty line after the shutdown reply closes stdin. Restart the managed demo after
its60s grants expire; rediscovery alone does not renew authority.
