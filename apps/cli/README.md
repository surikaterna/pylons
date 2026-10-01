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

After host creation, one-shot prints concise per-plugin lifecycle summaries to **stderr**, labelled
before and after owned shutdown. Only the authenticated tenant is discovered; an
A invocation does not fetch B metadata just for diagnostics. Add `--diagnostics`
anywhere among arguments for declared capabilities, extensions, actual event history
and source outcomes, e.g.:

```sh
bun run demo:cli -- --diagnostics "$ORIGIN" b-alice tests/demo/documents/long.json
bun run demo:cli -- "$ORIGIN" --session --diagnostics
```

Stdout remains machine-readable: validation/discovery has one JSON result; session retains the
ready line and ID-tagged replies. In session, `{"id":10,"op":"diagnostics"}` returns
the small safe projection, unlike the advanced internal test report. Detailed
stderr is emitted at session shutdown, not asynchronously between replies.
Failed discovery stops before demand, returns `{"code":2,"error":"discovery-failed"}`
and prints actionable source guidance. `invalid-plan` is invalid-or-expired, not a
claim of confirmed expiry. Restart a rebuilt demo from this worktree for new60s
fixture grants; use its printed fixture origin. New source does not update an
already-running older demo. No grant extension or automatic renewal is performed.
