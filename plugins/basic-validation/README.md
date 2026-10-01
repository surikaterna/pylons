# Private basic-validation provider

Data-only `manifest.json`; independently compiled browser and Bun CJS MF factory.
Provides `validation@1`, using explicit revision-bound `minLength` configuration
(A:3, B:8). Each activation owns its own mutable minimum/revision and immediately
owns acquired native resources. Supported replacement is atomic and returns the
exact applied revision; fail/mismatch fixtures do not pretend successful application.

The former early factory is preserved at
`tests/feasibility/plugins/basic-validation/factory.ts`, with its unchanged original
assertions and dedicated build. This final provider is not bundled into any host.
Private MIT demonstration, not a registry package. See [runbook](../../docs/demo.md).
