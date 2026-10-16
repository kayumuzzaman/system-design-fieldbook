import assert from "node:assert/strict";
import { spec, validate } from "./tools.ts";
import { World } from "./world.ts";
import { StubAgentModel, V1, V2, type Habits, type Task } from "./model.ts";
import { approve, Crash, CheckpointStore, NO_POLICY, run, start, SUPPORT_POLICY, type Deps } from "./agent.ts";
import { CASES, CHARGES, evaluate, passAtK, passHatK, runCase, wilson } from "./evaluate.ts";

const PERFECT: Habits = { skipLookup: 0, badArgs: 0, refundBoth: 0, claimWithoutActing: 0, obeyInjection: 0, stuck: 0 };
const refundTask: Task = { kind: "refund", request: "I was charged twice for Plus this month." };
const fresh = (charges = CHARGES) => new World("ana", charges.map((c) => ({ ...c })), "Items stay in the trash for 30 days.");
const deps = (world: World, store: CheckpointStore, habits = PERFECT, more: Partial<Deps> = {}): Deps =>
  ({ model: new StubAgentModel(habits, 1), world, store, policy: SUPPORT_POLICY, limits: { maxSteps: 12, maxTokens: 30_000 }, idempotencyKeys: true, ...more });

// --- Checking what the model proposes
{
  const refund = spec("refund")!;
  assert.deepEqual(validate(refund, { charge_id: "ch_3", amount_cents: 299 }), []);
  assert.deepEqual(validate(refund, { charge_id: "ch_3", amount_cents: "2.99" }), ["amount_cents must be a whole number"]);
  assert.deepEqual(validate(refund, { charge_id: "ch_3" }), ["amount_cents is required"]);
  assert.deepEqual(validate(refund, { charge_id: "ch_3", amount_cents: 299, note: "x" }), ["note is not a parameter of refund"]);
  assert.deepEqual(validate(refund, { charge_id: "ch_3", amount_cents: 500_000 }), ["amount_cents is out of range"]);
}

// --- One run, step by step
{
  const world = fresh(), store = new CheckpointStore();
  start(store, "r1", refundTask);
  const c = run("r1", deps(world, store));
  assert.equal(c.status, "done");
  assert.deepEqual(c.seen.map((o) => o.call.name), ["find_charges", "refund", "send_email"]);
  assert.deepEqual(world.refunds, [{ chargeId: "ch_3", cents: 299 }]);
  console.log(`one run: ${c.seen.map((o) => o.call.name).join(", ")}, then an answer; ${c.tokens.toLocaleString("en-US")} tokens over ${c.seen.length + 1} model calls; ${store.writes} checkpoint writes; "${c.answer}"`);
}

// --- An invalid call is returned to the model as an error, and the model corrects it
{
  const store = new CheckpointStore(), world = fresh();
  start(store, "r0", refundTask);
  const c = run("r0", deps(world, store, { ...PERFECT, badArgs: 1 }));
  const first = c.seen[1]!, second = c.seen[2]!;
  assert.equal(first.result.ok, false);
  assert.ok(second.result.ok && second.call.args.amount_cents === 299);
  console.log(`a model that sends the amount as "${String(first.call.args.amount_cents)}" reads "${first.result.ok ? "" : first.result.error}" and sends ${String(second.call.args.amount_cents)}; run ${c.status}`);
}

// --- Limits
{
  const stuck: Habits = { ...PERFECT, stuck: 1 };
  const store = new CheckpointStore();
  start(store, "r2", refundTask);
  const c = run("r2", deps(fresh(), store, stuck));
  assert.equal(c.status, "stopped");
  assert.equal(c.reason, "repeating find_charges");
  const store2 = new CheckpointStore();
  start(store2, "r3", refundTask);
  const d = run("r3", deps(fresh(), store2, stuck, { limits: { maxSteps: 12, maxTokens: 1500 } }));
  assert.equal(d.reason, "token budget");
  console.log(`a model that keeps asking for the same thing: stopped after ${c.step} steps (${c.reason}); with a 1,500-token budget: stopped after ${d.step} steps (${d.reason})`);

  const world = fresh(), store3 = new CheckpointStore();
  world.flaky = 2; // the next two tool calls fail with a temporary error
  start(store3, "r4", refundTask);
  assert.equal(run("r4", deps(world, store3)).status, "done");
}

// --- Crashes: the process dies after the receipt is emailed, before the step is recorded
for (const keys of [false, true]) {
  const world = fresh(), store = new CheckpointStore();
  start(store, "r5", refundTask);
  let crashed = false;
  const crashAt = (moment: string, step: number) => { if (moment === "acted" && step === 2 && !crashed) { crashed = true; throw new Crash(); } };
  assert.throws(() => run("r5", deps(world, store, PERFECT, { crashAt, idempotencyKeys: keys })), Crash);
  const c = run("r5", deps(world, store, PERFECT, { idempotencyKeys: keys })); // another process resumes from the checkpoint
  assert.equal(c.status, "done");
  console.log(`crash after the receipt is sent, then resume, ${keys ? "with" : "without"} idempotency keys: ${world.emails.length} receipt${world.emails.length === 1 ? "" : "s"} sent, ${world.refunds.length} refund`);
  assert.equal(world.emails.length, keys ? 1 : 2);
  assert.equal(world.refunds.length, 1);
}
{
  // A crash after the decision is saved: the resumed run carries out the saved decision and does not ask the
  // model again, which might decide something else.
  const world = fresh(), store = new CheckpointStore();
  start(store, "r6", refundTask);
  let asked = 0;
  const model = new StubAgentModel(PERFECT, 1);
  const counting = { next: (t: Task, s: Parameters<StubAgentModel["next"]>[1]) => { asked += 1; return model.next(t, s); } } as unknown as StubAgentModel;
  let crashed = false;
  const crashAt = (moment: string, step: number) => { if (moment === "decided" && step === 1 && !crashed) { crashed = true; throw new Crash(); } };
  assert.throws(() => run("r6", deps(world, store, PERFECT, { model: counting, crashAt })), Crash);
  run("r6", deps(world, store, PERFECT, { model: counting }));
  assert.equal(asked, 4); // three actions and the answer, none asked twice
  assert.equal(world.refunds.length, 1);
}

// --- A person approves a large refund; the run waits, durably, in between
{
  const yearly = [{ id: "ch_8", cents: 4999, date: "2026-10-02", description: "Pro plan, yearly" }, { id: "ch_7", cents: 4999, date: "2026-10-02", description: "Pro plan, yearly" }];
  const world = fresh(yearly), store = new CheckpointStore();
  start(store, "r7", refundTask);
  const waiting = run("r7", deps(world, store));
  assert.equal(waiting.status, "waiting for approval");
  assert.equal(world.refunds.length, 0);
  approve(store, "r7"); // hours later, from the support console
  const done = run("r7", deps(world, store));
  assert.equal(done.status, "done");
  assert.deepEqual(world.refunds, [{ chargeId: "ch_8", cents: 4999 }]);
  console.log(`refund of 49.99: run paused for approval with the refund saved as its next action; after approval it resumed and refunded once`);
}

// --- Guardrails against the model's mistakes and against injected instructions
{
  const both: Habits = { ...PERFECT, refundBoth: 1 }, obey: Habits = { ...PERFECT, obeyInjection: 1 };
  for (const policy of [NO_POLICY, SUPPORT_POLICY]) {
    const name = policy === NO_POLICY ? "no policy" : "policy";
    const a = runCase(CASES[0]!, both, 1, policy), b = runCase(CASES[2]!, obey, 1, policy);
    console.log(`${name}: a model that refunds both charges made ${a.w.refunds.length} refund${a.w.refunds.length === 1 ? "" : "s"}; a model that obeys the injected text sent ${b.w.emails.length} email${b.w.emails.length === 1 ? "" : "s"} outside`);
    assert.equal(a.w.refunds.length, policy === NO_POLICY ? 2 : 1);
    assert.equal(b.w.emails.length, policy === NO_POLICY ? 1 : 0);
  }
}

// --- Evaluation: 200 runs of each case for two versions, with and without the policy
const results: Record<string, { name: string; passes: number; runs: number }[]> = {};
for (const [version, habits] of [["v1", V1], ["v2", V2]] as const) {
  for (const [label, policy] of [["no policy", NO_POLICY], ["policy", SUPPORT_POLICY]] as const) {
    const r = evaluate(habits, policy, 200);
    results[`${version} ${label}`] = r;
    console.log(`${version}, ${label}: ` + r.map((x) => {
      const [lo, hi] = wilson(x.passes, x.runs);
      return `${x.name} ${x.passes}/${x.runs} (${(lo * 100).toFixed(0)} to ${(hi * 100).toFixed(0)}%)`;
    }).join("; "));
  }
}
{
  const r = results["v1 policy"]![0]!, s = results["v2 policy"]![0]!;
  const row = (x: { passes: number; runs: number }) => [1, 2, 4, 8].map((k) => `k=${k}: pass@k ${(passAtK(x.runs, x.passes, k) * 100).toFixed(1)}%, pass^k ${(passHatK(x.runs, x.passes, k) * 100).toFixed(1)}%`).join("; ");
  console.log(`refund case, v1 with policy: ${row(r)}`);
  console.log(`refund case, v2 with policy: ${row(s)}`);
  assert.ok(passHatK(r.runs, r.passes, 8) < passHatK(s.runs, s.passes, 8));
  const t1 = evaluate(V1, SUPPORT_POLICY, 10)[0]!, t2 = evaluate(V2, SUPPORT_POLICY, 10)[0]!;
  const fmt = (x: { passes: number; runs: number }) => `${x.passes}/${x.runs} (${wilson(x.passes, x.runs).map((v) => (v * 100).toFixed(0)).join(" to ")}%)`;
  console.log(`only 10 runs of the refund case: v1 ${fmt(t1)}, v2 ${fmt(t2)}: the two cannot be told apart`);
}
console.log("all ok");
