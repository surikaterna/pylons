# @pylons/loader-mf

Unpublished **0.0.0**; initial minor changeset records future 0.1.0 intent.
Use `createBrowserLoader` from `@pylons/loader-mf/browser`, or
`createServerLoader` from `@pylons/loader-mf/server` under **Bun 1.4.2** for
server/CLI. There is deliberately no ambiguous root entrypoint. Both return the
actual contracts `ArtifactLoader`: successful loads return reusable **factories**,
never tenant activation instances. No core, UI, Ghost, Weaver or React dependency.

## Required options and admission

`LoaderOptions` requires an explicit operator ID and trusted operator/publisher/
origin allowlists, bounded mappings, five positive integer limits and a diagnostic
sink. No permissive default, ambient authentication credential or automatic trust.
Limits are `timeoutMilliseconds`, `maximumBytes`, `maximumMappings`,
`maximumMetadataCharacters`, and `maximumReservations`. Metadata limits cover
the entire adapter configuration; activation configuration is not a loader input.
The host/core separately bounds and authorizes tenant configuration and invocation.

Each `ArtifactMapping` pins the full canonical definition, exact binding, host,
publisher ID, MF container, expose (such as `./factory`), named export (such as
`factory`), `profile: "single-script"`, and `executableFiles: [binding.locator]`.
The definition and binding are detached at construction. The request must match
the parsed definition and its exact selected extension, supported host, binding
including independent artifact version, loader ID, locator and SHA256. The
operator's allowlisted publisher attests the exact bytes and supported build
profile; publisher identity is **operator authority**, not a field invented in
the neutral contracts or a signature claimed to be present in downloaded code.
Duplicate matching maps and malformed configuration fail closed.

`single-script` is a mandatory publisher/operator build attestation: all exposed
code, runtime and dependencies must be embedded in one generated container, with
no executable child chunks, nested remotes, external runtime dependencies or
dynamic executable fetches. Mapping additional files is rejected **before load**.
This initial profile does not implement a child-code integrity pipeline or claim
to detect malicious behavior by parsing arbitrary trusted JavaScript. Such code
is outside the supported profile, not protected by imaginary chunk SRI.

## Exact transport and SDK execution

Both targets fetch once with omitted ambient credentials, rejected redirects,
exact HTTP200 and response URL, mandatory abort timeout, bounded declared and
streamed bytes, fatal UTF-8 and SHA256 before evaluation. No unchecked refetch.

Server uses real MF `createInstance/loadRemote`. Its `loadEntry` delegates to the
unaltered **SDK 2.9.0 `loadScriptNode`**; the fetch lifecycle returns a Response
containing exactly the checked bytes. There is no custom evaluator, container
init replacement, local plugin import, Node fallback or SDK source patch.

Browser also uses real MF `createInstance/loadRemote` and its native generated
script path. It creates a short-lived Blob URL from the **verified HTTP bytes**,
sets native SHA256 SRI/anonymous CORS on the SDK-created script, and revokes the
URL/removes the element on completion or abort. This makes the exact checked
response the native script input: an HTTP script refetch could redirect or change
size between checking and evaluation. It is not `eval`, a custom module loader,
or a substitute local plugin. Actual Chromium tests exercise the downloaded MF
container; a separate native-SRI regression rejects wrong Blob bytes before
execution. Browser deployment requires HTTPS/localhost Web Crypto, artifact CORS
and CSP permission for `blob:` scripts; no page CSP or broad Node polyfill is
modified by the adapter. Relative child chunks cannot use the Blob as a base,
reinforcing the explicitly single-script profile rather than general MF support.

## Ownership and failure semantics

One realm-global reservation registry (shared even between copies of the package)
owns plugin definition/artifact version, physical artifact identity and container
name. Different versions, changed digest/locator/expose or same container across
different origins/plugins conflict **synchronously before the second execution**.
Reservations and terminal failed flights persist for the realm lifetime, including
pre-evaluation failure, timeout, cancellation and partial evaluation. Recovery is
a fresh process/realm; there is no unsafe release permitting a different version
after potentially evaluated code. Existing unrelated container globals are not
adopted. Reservation limits bound retained cache entries.

Concurrent exact loads share one cached immutable factory wrapper, with separate
cancellation leases. One cancelled caller cannot abort surviving callers. The
last abandoned lease aborts owned transport/script work; late noncooperative
completion cannot publish to that caller or cache a success. All acquired loader
resources are cleaned. Already executed MF/plugin code is not undone or unloaded.
Activations, mutable provider instances and their resources belong to the host's
tenant **scope/generation**, not this module cache. Activate separately per tenant
and pass principal/credential-reference/transaction per invocation. No tenant
namespace or logger singleton switch is used.

Named export shape is checked **after evaluation**. Wrong exports return
`invalid-factory`, not a false claim of zero execution. Admission/version conflict
returns `denied`; wrong target `unsupported-host`; byte hash failure
`integrity-mismatch`; network/status/size/timeout/SDK errors `load-failed`;
cancelled leases `cancelled`. Failure cache means exact retry returns the same
terminal outcome. Diagnostics submit fixed `load-failed` codes only, never raw
errors, URLs, config/documents or arbitrary caller parameters. This is not a
sandbox or a blanket redaction guarantee for browser devtools, vendors or trusted
plugin code bypassing the diagnostic sink.

## Packaging and verification

Exact runtime graph: this package, contracts0.0.0/Zod3.25.76, and MF
runtime/runtime-core/sdk/error-codes2.9.0. The vendors are universal packages;
their installed physical Node helpers are not an unchosen Pylons server adapter.
Only the chosen target's Pylons JS participates. Public declarations reference
portable contracts/options only: strict ES2022/types[] NodeNext **and** Bundler
consumers do not load MF, DOM, Bun/Node, webpack or ambient-shim declarations.
Private compilation retains the previously approved feasibility vendor-context
alias and project tooling types; neither leaks through packed target exports.

`bun run build:loader`, `bun run test:loader:e2e`, and
`bun scripts/verify-loader-package.ts` are also wired into root gates. The verifier
packs real tarballs, installs separate clean target consumers and runs actual
remote execution. Its local sibling contracts override is **development evidence,
not registry-resolved installation**. No publish/version/PR/merge or Ghost adoption
is performed. See `docs/loader-mf.md` and canonical `armada-0wq76.6` for evidence.
