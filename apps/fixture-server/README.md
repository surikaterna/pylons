# Private HTTP fixture issuer

Canonical scoped ResolvedPlan metadata/catalog, operator-trusted generated artifacts,
known document fixtures and authenticated deterministic control/fault inputs. This
service NEVER imports or executes plugin implementations. Deadlines are issued once,
not renewed by reads/outages. Records started requests separately from completed
fixture-produced responses with actual status/bytes/SHA/timestamps.
Original early service remains in `tests/feasibility/apps/fixture-server`.
See [runbook](../../docs/demo.md); lab loopback authority is not production security.
