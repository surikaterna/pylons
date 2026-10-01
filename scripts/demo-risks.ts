import type { Host } from "@pylons/contracts";
import type { startFixture } from "../apps/fixture-server/main.js";
import { balanced, check, count, get, list, snapshots, validate, waitFor } from "./demo-assert.js";
import type { Client } from "./demo-client.js";

type Fixture = Awaited<ReturnType<typeof startFixture>>;
export async function ready(client: Client): Promise<void> {
  for (const scope of ["a", "b"]) check(get(get(await client.command({ op: "discover", tenant: scope }), "result"), "success") === true, "scope-refresh");
  check(get(await client.command({ op: "security", ready: true }), "success") === true, "security-initialized");
}
function generation(value: unknown, scope: string, plugin = "basic-validation") {
  const entry = snapshots(value, scope)
    .filter((snapshot) => get(get(get(snapshot, "generation"), "definition"), "pluginId") === plugin)
    .at(-1);
  check(entry, "snapshot-present");
  return { state: entry.state, desired: get(get(entry, "generation"), "desiredRevision"), applied: get(get(entry, "generation"), "appliedRevision") };
}
export async function updates(client: Client, fixture: Fixture): Promise<void> {
  await ready(client);
  await validate(client, "a-alice", "four", 0);
  await validate(client, "b-alice", "A long document title", 0, "REF-1");
  fixture.scopes.a.revision = "r2";
  fixture.scopes.a.values["basic-validation"].minLength = 8;
  await client.command({ op: "refresh", tenant: "a" });
  await validate(client, "a-alice", "four", 1);
  check(
    JSON.stringify(generation(await client.command({ op: "report" }), "a")) === JSON.stringify({ state: "ready", desired: "r2", applied: "r2" }),
    "D06-supported-atomic-replacement",
  );
  for (const [revision, mode, applied] of [
    ["r3", "fail", "r2"],
    ["r5", "mismatch", "r4"],
  ] satisfies readonly (readonly [string, string, string])[]) {
    fixture.scopes.a.revision = revision;
    fixture.scopes.a.values["basic-validation"].replace = mode;
    await client.command({ op: "refresh", tenant: "a" });
    const snapshot = generation(await client.command({ op: "report" }), "a");
    check(snapshot.desired === revision && snapshot.applied === applied && snapshot.state === "failed", "D06-desired-not-applied");
    await validate(client, "a-alice", "long enough", 2);
    if (revision === "r3") {
      fixture.scopes.a.revision = "r4";
      fixture.scopes.a.values["basic-validation"].replace = "ok";
      await client.command({ op: "refresh", tenant: "a" });
      await validate(client, "a-alice", "long enough", 0);
    }
  }
  fixture.scopes.b.revision = "r2";
  await client.command({ op: "refresh", tenant: "b" });
  const unsupported = generation(await client.command({ op: "report" }), "b", "reference-required");
  check(unsupported.state === "restart-required" && unsupported.desired === "r2" && unsupported.applied === "r1", "D06-unsupported-replacement");
  fixture.scopes.b.enabled = false;
  fixture.scopes.b.revision = "disabled";
  await client.command({ op: "refresh", tenant: "b" });
  await validate(client, "b-alice", "long enough", 2, "REF-1");
  check(
    snapshots(await client.command({ op: "report" }), "b").every((snapshot) => snapshot.state === "disabled"),
    "D07-disable-during-restart",
  );
  const downloads = fixture.trace.filter((entry) => entry.path.startsWith("artifacts/")).length;
  fixture.scopes.a.version = "2";
  fixture.scopes.a.revision = "new-version";
  await client.command({ op: "refresh", tenant: "a" });
  await validate(client, "a-alice", "long enough", 2);
  check(generation(await client.command({ op: "report" }), "a").state === "restart-required", "D06-version-conflict");
  check(fixture.trace.filter((entry) => entry.path.startsWith("artifacts/")).length === downloads, "D06-no-hot-reload");
}
export async function expiry(client: Client, fixture: Fixture): Promise<void> {
  await ready(client);
  await validate(client, "a-alice", "four", 0);
  fixture.scopes.a.until = Date.now() + 180;
  fixture.scopes.a.revision = "finite-deadline";
  await client.command({ op: "refresh", tenant: "a" });
  fixture.scopes.a.outage = true;
  check(get(await client.command({ op: "refresh", tenant: "a" }), "success") === false, "D07-source-outage");
  await validate(client, "a-alice", "four", 0);
  await Bun.sleep(230);
  await validate(client, "a-alice", "four", 2);
  check(
    snapshots(await client.command({ op: "report" }), "a").every((snapshot) => snapshot.state === "denied"),
    "D07-real-expiry",
  );
  await validate(client, "b-alice", "long enough", 0, "REF-1");
  fixture.scopes.b.authorized = false;
  await client.command({ op: "refresh", tenant: "b" });
  await validate(client, "b-alice", "long enough", 2, "REF-1");
}
export async function failure(client: Client, fixture: Fixture, host: Host, partial: boolean): Promise<void> {
  if (partial) fixture.scopes.b.values["basic-validation"].initMode = "partial-fail";
  else fixture.fail(`artifacts/reference-required/${host === "browser" ? "browser" : "server"}.js`);
  await ready(client);
  await validate(client, "a-alice", "four", 0);
  await validate(client, "b-alice", "long enough", 2, "REF-1");
  await validate(client, "a-bob", "four", 0);
  const proof = await client.command({ op: "report" });
  check(
    snapshots(proof, "b").some((snapshot) => snapshot.state === (partial ? "blocked" : "failed")),
    "D08-failed-versus-absent",
  );
  if (partial) {
    check(!fixture.trace.some((entry) => entry.path.includes("artifacts/reference-required")), "D08-required-dependency-block");
    check(count(proof, "acquired", "basic-validation", "b") === 2 && count(proof, "cleanup", "basic-validation", "b") === 2, "D08-partial-cleanup");
  } else
    check(
      fixture.trace.some((entry) => entry.path.includes("artifacts/reference-required") && entry.status === 503),
      "D08-actual-http-failure",
    );
}
export async function cleanup(client: Client, fixture: Fixture): Promise<void> {
  fixture.scopes.a.values["basic-validation"].cleanupThrow = true;
  await ready(client);
  await validate(client, "a-alice", "four", 0);
  const result = await client.command({ op: "shutdown" });
  check(get(list(get(result, "results"))[0], "success") === false, "D09-cleanup-failure-reported");
  const proof = await client.command({ op: "report" });
  check(count(proof, "cleanup", "basic-validation", "a") === 3, "D09-all-disposers-after-throw");
  balanced(proof);
  check(get(proof, "timers") === 0, "D09-timers-zero");
}
export async function late(client: Client, fixture: Fixture, host: Host, mode: "read" | "load" | "init"): Promise<void> {
  const path =
    mode === "read"
      ? `metadata/${host}/a`
      : mode === "load"
        ? `artifacts/basic-validation/${host === "browser" ? "browser" : "server"}.js`
        : "init/basic-validation/a";
  if (mode === "init") {
    fixture.scopes.a.values["basic-validation"].initMode = "hold";
    fixture.scopes.a.values["basic-validation"].ignoreCancel = true;
  }
  await ready(client);
  fixture.hold(path);
  const previous = fixture.requests.filter((value) => value === path).length;
  const pending = client.command(mode === "read" ? { op: "refresh", tenant: "a" } : { op: "validate", token: "a-alice", document: { title: "four" } });
  await waitFor(() => fixture.requests.filter((value) => value === path).length > previous);
  await client.command({ op: "shutdown" });
  const stopped = await client.command({ op: "report" });
  fixture.release(path);
  check(mode === "read" ? get(await pending, "success") === false : get(await pending, "code") === 2, "D09-no-late-result");
  await Bun.sleep(50);
  const final = await client.command({ op: "report" });
  const after = list(get(final, "events")).slice(list(get(stopped, "events")).length);
  check(
    after.every((record) => get(get(get(record, "event"), "snapshot"), "state") !== "ready" && get(get(record, "event"), "ready") !== true),
    "D09-no-late-publication-events",
  );
  check(
    snapshots(final, "a").every((snapshot) => snapshot.state !== "ready"),
    "D09-no-late-readiness",
  );
  balanced(final);
  check(get(final, "timers") === 0, "D09-late-timers-zero");
  if (mode !== "init") check(count(final, "activation") === count(stopped, "activation"), "D09-no-late-activation");
  else check(count(final, "acquired", "basic-validation", "a") === 3, "D09-late-resource-owned");
}
