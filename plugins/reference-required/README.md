# Private reference-required provider

MIT owned demonstration code, not a publishable package. `manifest.json` is data
only and matches the metadata definition used by the fixture. The separately
compiled MF factory provides `reference-validation@1` and requires readiness of
`validation@1`; it does not invent activation-context provider lookup. Hosts
explicitly invoke both guarded capabilities. No configuration replacement method
is present: a revision change reports restart-required, never silently applied.

Browser and Bun CJS single-script containers have distinct target bytes and their
own `demo_reference_required` identity, separate from `demo_basic_validation`.
Mutable resources and requests belong to scoped activations/invocations. See
[demo runbook](../../docs/demo.md) for real loading, security and cleanup limits.
