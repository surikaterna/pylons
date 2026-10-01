import { expect, test } from "bun:test";
import type { Cancellation, Clock, InvocationContext, InvocationFailure, JsonValue, Result } from "@pylons/contracts";
import { CancellationSource } from "../src/cancellation.js";
import { invocationOperation } from "../src/invocation-operation.js";
import { capability, extension, flush, harness, plan, signal, TestClock } from "./fixtures.js";
import { countedProvider, invocationHarness, pendingOperation, providerActivation, start, TrackedSignal } from "./invocation-cancellation-fixtures.js";

type Outcome = Result<JsonValue, InvocationFailure>;
const cancelled: Outcome = { success: false, error: { code: "cancelled" } };
const successful: Outcome = { success: true, data: "completed" };

function request(subjectId: string, cancellation: Cancellation): InvocationContext {
  return { principal: { subjectId }, credential: { reference: "test-reference" }, transaction: { id: "test-transaction" }, cancellation };
}

const laterActions: readonly ("caller" | "shutdown")[] = ["caller", "shutdown"];
for (const later of laterActions) {
  test(`provider deadline cancels cooperative work before result and later ${later}`, async () => {
    const clock = new TestClock();
    const work = pendingOperation<Outcome>(clock, cancelled);
    const caller = new TrackedSignal();
    const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
    await start(fixture);
    const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    expect(work.state().active).toBe(true);
    clock.advance(100);
    expect(work.state()).toEqual({ active: false, cancellations: 1, cancelled: true });
    expect(caller.cancelled).toBe(false);
    expect(caller.subscriptions).toBe(0);
    expect(await pending).toEqual({ success: false, error: { code: "provider-failed" } });
    expect(clock.pending).toBe(1);
    if (later === "caller") caller.cancel();
    await fixture.runtime.shutdown();
    expect(work.state().cancellations).toBe(1);
    expect(clock.pending).toBe(0);
  });
}

test("timeout classification is latched before synchronous cancellation reentry", async () => {
  const clock = new TestClock();
  const caller = new TrackedSignal();
  let shutdown = () => {};
  const work = pendingOperation<Outcome>(clock, cancelled, () => {
    caller.cancel();
    shutdown();
  });
  const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
  shutdown = () => {
    void fixture.runtime.shutdown();
  };
  await start(fixture);
  const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
  await flush();
  clock.advance(100);
  expect(await pending).toEqual({ success: false, error: { code: "provider-failed" } });
  expect(work.state()).toEqual({ active: false, cancellations: 1, cancelled: true });
  expect(caller.subscriptions).toBe(0);
  expect(clock.pending).toBe(0);
});

test("hanging authority is cancelled at policy bound, returns denied and never enters provider", async () => {
  const clock = new TestClock();
  const caller = new TrackedSignal();
  const authorization = pendingOperation<{ readonly kind: "allow" } | { readonly kind: "deny" }>(clock, { kind: "deny" }, () => caller.cancel());
  const counted = countedProvider(successful);
  const fixture = invocationHarness(counted.provider, clock, {
    authorize: ({ invocation }) => authorization.start(invocation),
  });
  await start(fixture);
  const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
  await flush();
  clock.advance(100);
  expect(authorization.state()).toEqual({ active: false, cancellations: 1, cancelled: true });
  expect(await pending).toEqual({ success: false, error: { code: "denied" } });
  expect(counted.entries()).toBe(0);
  expect(caller.subscriptions).toBe(0);
  await fixture.runtime.shutdown();
  expect(clock.pending).toBe(0);
});

for (const result of [successful, { success: false, error: { code: "invalid-input" } }] satisfies readonly Outcome[]) {
  test(`settled ${result.success ? "success" : "typed provider failure"} has no spurious cancellation`, async () => {
    const clock = new TestClock();
    const caller = new TrackedSignal();
    const work = pendingOperation<Outcome>(clock, cancelled);
    const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
    await start(fixture);
    const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    work.finish(result);
    expect(await pending).toEqual(result);
    caller.cancel();
    await fixture.runtime.shutdown();
    expect(work.state()).toEqual({ active: false, cancellations: 0, cancelled: false });
    expect(caller.subscriptions).toBe(0);
    expect(clock.pending).toBe(0);
  });
}

test("settled provider rejection is not reclassified or spuriously cancelled", async () => {
  const clock = new TestClock();
  const work = pendingOperation<Outcome>(clock);
  const caller = new TrackedSignal();
  const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
  await start(fixture);
  const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
  await flush();
  work.fail();
  expect(await pending).toEqual({ success: false, error: { code: "provider-failed" } });
  await fixture.runtime.shutdown();
  expect(work.state()).toEqual({ active: false, cancellations: 0, cancelled: false });
  expect(caller.subscriptions).toBe(0);
  expect(clock.pending).toBe(0);
});

test("one request timeout leaves concurrent call and shared generation usable", async () => {
  const clock = new TestClock();
  const slow = pendingOperation<Outcome>(clock, cancelled);
  const survivor = pendingOperation<Outcome>(clock, cancelled);
  const firstCaller = new TrackedSignal();
  const secondCaller = new TrackedSignal();
  const fixture = invocationHarness({ invoke: (input, context) => (input === "slow" ? slow.start(context) : survivor.start(context)) }, clock);
  await start(fixture);
  const first = fixture.runtime.invoke(capability, "slow", request("alice", firstCaller));
  await flush();
  clock.advance(50);
  const second = fixture.runtime.invoke(capability, "survivor", request("bob", secondCaller));
  await flush();
  clock.advance(50);
  expect(await first).toEqual({ success: false, error: { code: "provider-failed" } });
  expect(slow.state().cancelled).toBe(true);
  expect(survivor.state()).toEqual({ active: true, cancellations: 0, cancelled: false });
  expect(secondCaller.subscriptions).toBe(1);
  survivor.finish(successful);
  expect(await second).toEqual(successful);
  expect((await fixture.runtime.startup()).success).toBe(true);
  await fixture.runtime.shutdown();
  expect(firstCaller.subscriptions + secondCaller.subscriptions).toBe(0);
  expect(clock.pending).toBe(0);
});

const earlierActions: readonly ("caller" | "shutdown" | "revocation")[] = ["caller", "shutdown", "revocation"];
for (const earlier of earlierActions) {
  test(`earlier ${earlier} retains cancellation and readiness semantics`, async () => {
    const clock = new TestClock();
    const work = pendingOperation<Outcome>(clock, cancelled);
    const caller = new TrackedSignal();
    let denied = false;
    const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
    const source = fixture.runtime;
    await start(fixture);
    const pending = source.invoke(capability, null, request("alice", caller));
    await flush();
    if (earlier === "caller") caller.cancel();
    else if (earlier === "shutdown") await source.shutdown();
    else {
      fixture.revoke();
      denied = true;
      await source.refresh();
    }
    expect(work.state()).toEqual({ active: false, cancellations: 1, cancelled: true });
    expect(await pending).toEqual({ success: false, error: { code: earlier === "caller" ? "cancelled" : "unavailable" } });
    if (denied) expect((await source.startup()).success).toBe(false);
    await source.shutdown();
    expect(caller.subscriptions).toBe(0);
    expect(clock.pending).toBe(0);
  });
}

const settlements: readonly ("resolve" | "reject")[] = ["resolve", "reject"];
for (const settlement of settlements) {
  test(`noncooperative late ${settlement} cannot change a latched invocation timeout`, async () => {
    const clock = new TestClock();
    const work = pendingOperation<Outcome>(clock);
    const caller = new TrackedSignal();
    const fixture = invocationHarness({ invoke: (_input, context) => work.start(context) }, clock);
    await start(fixture);
    const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    clock.advance(100);
    const result = await pending;
    expect(result).toEqual({ success: false, error: { code: "provider-failed" } });
    expect(work.state()).toEqual({ active: true, cancellations: 1, cancelled: true });
    expect(caller.subscriptions).toBe(0);
    if (settlement === "resolve") work.finish(successful);
    else work.fail();
    await flush();
    expect(await pending).toEqual(result);
    await fixture.runtime.shutdown();
    expect(clock.pending).toBe(0);
  });
}

test("already cancelled caller does not enter provider", async () => {
  const counted = countedProvider(successful);
  const clock = new TestClock();
  const fixture = invocationHarness(counted.provider, clock);
  await start(fixture);
  const caller = new TrackedSignal();
  caller.cancel();
  expect(await fixture.runtime.invoke(capability, null, request("alice", caller))).toEqual(cancelled);
  expect(counted.entries()).toBe(0);
  expect(caller.subscriptions).toBe(0);
  await fixture.runtime.shutdown();
  expect(clock.pending).toBe(0);
});

for (const earlier of earlierActions) {
  test(`earlier ${earlier} cancels pending authority without provider entry`, async () => {
    const clock = new TestClock();
    const caller = new TrackedSignal();
    const authorization = pendingOperation<{ readonly kind: "deny" }>(clock, { kind: "deny" });
    const counted = countedProvider(successful);
    const fixture = invocationHarness(counted.provider, clock, {
      authorize: ({ invocation }) => authorization.start(invocation),
    });
    await start(fixture);
    const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    if (earlier === "caller") caller.cancel();
    else if (earlier === "shutdown") await fixture.runtime.shutdown();
    else {
      fixture.revoke();
      await fixture.runtime.refresh();
    }
    expect(await pending).toEqual(cancelled);
    expect(authorization.state()).toEqual({ active: false, cancellations: 1, cancelled: true });
    expect(counted.entries()).toBe(0);
    expect(caller.subscriptions).toBe(0);
    await fixture.runtime.shutdown();
    expect(clock.pending).toBe(0);
  });
}

const authoritySettlements: readonly ("allow" | "reject")[] = ["allow", "reject"];
for (const settlement of authoritySettlements) {
  test(`late authority ${settlement} after policy timeout cannot enter provider after recovery`, async () => {
    const clock = new TestClock();
    const authorization = pendingOperation<{ readonly kind: "allow" }>(clock);
    let decisions = 0;
    const counted = countedProvider(successful);
    const fixture = invocationHarness(counted.provider, clock, {
      async authorize({ invocation }) {
        decisions++;
        return decisions === 1 ? authorization.start(invocation) : { kind: "allow" };
      },
    });
    await start(fixture);
    const caller = new TrackedSignal();
    const old = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    clock.advance(100);
    expect(await old).toEqual({ success: false, error: { code: "denied" } });
    expect(authorization.state().cancelled).toBe(true);
    fixture.revoke();
    await fixture.runtime.refresh();
    fixture.restore();
    await fixture.runtime.refresh();
    expect((await fixture.runtime.startup()).success).toBe(true);
    if (settlement === "allow") authorization.finish({ kind: "allow" });
    else authorization.fail();
    await flush();
    expect(counted.entries()).toBe(0);
    expect(await fixture.runtime.invoke(capability, null, request("bob", new TrackedSignal()))).toEqual(successful);
    expect(counted.entries()).toBe(1);
    expect(await old).toEqual({ success: false, error: { code: "denied" } });
    await fixture.runtime.shutdown();
    expect(caller.subscriptions).toBe(0);
    expect(clock.pending).toBe(0);
  });
}

test("synchronous deadline callback cancels locally and releases parents/timer without operation entry", async () => {
  let entries = 0;
  let disposed = 0;
  const clock: Clock = {
    now: () => 0,
    schedule(_delay, callback) {
      callback();
      return {
        dispose: () => {
          disposed++;
        },
      };
    },
  };
  const caller = new TrackedSignal();
  const local = new CancellationSource([caller]);
  const result = await invocationOperation(
    async () => {
      entries++;
      return successful;
    },
    clock,
    1,
    local,
  );
  expect(result).toEqual({ kind: "timeout" });
  expect(local.cancelled).toBe(true);
  expect(caller.cancelled).toBe(false);
  expect(caller.subscriptions).toBe(0);
  expect(disposed).toBe(1);
  expect(entries).toBe(0);
});

test("late timed-out provider cannot publish into a recovered scoped plugin generation", async () => {
  const clock = new TestClock();
  const work = pendingOperation<Outcome>(clock);
  const fixture = harness(
    undefined,
    {
      activate: providerActivation({ invoke: (input, context) => (input === "old" ? work.start(context) : Promise.resolve(successful)) }),
    },
    { clock },
  );
  await fixture.runtime.refresh();
  await fixture.runtime.demand(capability, signal());
  const oldGeneration = fixture.runtime.snapshots()[0]?.generation.generationId;
  const caller = new TrackedSignal();
  const pending = fixture.runtime.invoke(capability, "old", request("alice", caller));
  await flush();
  clock.advance(100);
  expect(await pending).toEqual({ success: false, error: { code: "provider-failed" } });
  expect(fixture.runtime.snapshots()[0]?.state).toBe("ready");
  expect(await fixture.runtime.invoke(capability, "still-ready", request("bob", new TrackedSignal()))).toEqual(successful);
  fixture.setPlan(plan([{ id: "base", entries: [extension()], enabled: false }], "disabled"));
  await fixture.runtime.refresh();
  fixture.setPlan(plan([{ id: "base", entries: [extension()] }], "recovered"));
  await fixture.runtime.refresh();
  await fixture.runtime.demand(capability, signal());
  expect(fixture.runtime.snapshots()[0]?.generation.generationId).not.toBe(oldGeneration);
  const recovered = fixture.runtime.snapshots();
  const eventCount = fixture.events.length;
  work.finish(successful);
  await flush();
  expect(await pending).toEqual({ success: false, error: { code: "provider-failed" } });
  expect(fixture.events.length).toBe(eventCount);
  expect(fixture.runtime.snapshots()).toEqual(recovered);
  expect(await fixture.runtime.invoke(capability, "new", request("bob", new TrackedSignal()))).toEqual(successful);
  await fixture.runtime.shutdown();
  expect(caller.subscriptions).toBe(0);
  expect(clock.pending).toBe(0);
});

const completedDecisions: readonly ("allow" | "deny" | "reject")[] = ["allow", "deny", "reject"];
for (const decision of completedDecisions) {
  test(`completed authority ${decision} has no spurious cancellation`, async () => {
    const clock = new TestClock();
    const authorization = pendingOperation<{ readonly kind: "allow" } | { readonly kind: "deny" }>(clock);
    const counted = countedProvider(successful);
    const fixture = invocationHarness(counted.provider, clock, {
      authorize: ({ invocation }) => authorization.start(invocation),
    });
    await start(fixture);
    const caller = new TrackedSignal();
    const pending = fixture.runtime.invoke(capability, null, request("alice", caller));
    await flush();
    if (decision === "reject") authorization.fail();
    else authorization.finish({ kind: decision });
    expect(await pending).toEqual(decision === "allow" ? successful : { success: false, error: { code: "denied" } });
    expect(counted.entries()).toBe(Number(decision === "allow"));
    caller.cancel();
    await fixture.runtime.shutdown();
    expect(authorization.state()).toEqual({ active: false, cancellations: 0, cancelled: false });
    expect(caller.subscriptions).toBe(0);
    expect(clock.pending).toBe(0);
  });
}
