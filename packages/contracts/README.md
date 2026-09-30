# @pylons/contracts

Unpublished **0.0.0**, MIT, Copyright (c) Surikaterna. ESM and TypeScript
declarations only; no CJS compatibility claim. The initial minor changeset records
additive 0.1.0 intent; no versioning or publication has occurred.

Named parsers accept `unknown` and return `Result<T, ParseFailure>`:
`parsePluginDefinition`, `parseInstallationInventory`, `parseConfigSideband`,
`parseResolvedPlan`. Definition, inventory, private config and deployment binding
are separate ownership boundaries. Zero executable extensions are valid.

The package also exports narrow types for source/catalog/loader/admission,
factory/provider/cleanup, cancellation, clock, observation and safe diagnostics.
It does **not** implement a runtime engine, authorization, compatibility negotiation,
expiry enforcement, dependency-cycle resolution, HTTP, federation, UI or logging driver.

Parsers own detached JSON snapshots: original values cannot mutate parsed config.
JSON snapshots are recursively frozen; schema object/array `.readonly()` freezes
only each schema node, not arbitrary external objects passed to adapter interfaces.
Do not treat readonly TypeScript as a general runtime immutability or sandbox guarantee.
Inputs are bounded to 10,000 visited values, 64 levels and 1,000,000 aggregate string/key
characters. Shared acyclic references are accepted, duplicated into the snapshot and
counted per visit. Cycles, accessors, sparse arrays, classes, symbols and nonfinite
numbers fail safely. Own JSON `__proto__` keys are preserved. Proxy inspection traps
can execute; this parser is not a hostile-code sandbox.

Runtime dependency is exact `zod@3.25.76`; selected imports/declarations use `zod/v3`.
Zod retains its own MIT terms. Package installation contains Zod's other files, but
the selected executable/declaration closure is v3 only, with no ambient/DOM types.

See repository docs/contracts.md for the full API, provenance, intentional legacy
divergences and next-phase author fixture. Packed consumer validation is local proof,
not registry availability, MF/browser/HTTP proof or production security certification.
