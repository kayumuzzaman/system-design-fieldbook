import assert from "node:assert/strict";
import { apply, cloneState, empty, Partition, replay, stateHash, total, type Event, type State } from "./wallet.ts";
import { crossPartition, PROTOCOLS, waits } from "./protocols.ts";
import { seeded } from "./random.ts";

const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

// --- one partition: 20,000 wallets, 200,000 transfer requests
const p = new Partition();
const random = seeded(95);
for (let i = 0; i < 20_000; i += 1) { p.handle({ type: "open", account: `w${i}` }); p.handle({ type: "deposit", account: `w${i}`, amount: 50_000, ref: `d${i}` }); }
const start = total(p.state);
let rejected = 0, repeats = 0;
for (let t = 0; t < 200_000; t += 1) {
  const id = `t${t}`, cmd = { type: "transfer" as const, id, from: `w${Math.floor(random() * 20_000)}`, to: `w${Math.floor(random() * 20_000)}`, amount: 1 + Math.floor(random() * 20_000) };
  const ev = p.handle(cmd);
  if (ev[0]?.type === "Rejected") rejected += 1;
  if (random() < 0.02) { assert.equal(p.handle(cmd).length, 0); repeats += 1; }   // a retried request decides nothing new
}
assert.equal(total(p.state), start);
for (const v of p.state.balances.values()) assert.ok(v >= 0);
console.log(`one partition: ${fmt(p.log.length)} events from 200,000 transfer requests (${fmt(rejected)} refused for lack of funds, ${fmt(repeats)} retries ignored); money in = money now: ${fmt(start / 100)}`);

// --- replay: from the start, and from a snapshot, to the same state
const full = replay(p.log);
const cut = Math.floor(p.log.length * 0.9);
const snap = replay(p.log.slice(0, cut));
const fromSnap = replay(p.log, snap, cut);
console.log(`state hash: live ${stateHash(p.state)}, replayed ${stateHash(full)}, from a snapshot at event ${fmt(cut)} ${stateHash(fromSnap)}`);
assert.equal(stateHash(full), stateHash(p.state));
assert.equal(stateHash(fromSnap), stateHash(p.state));

// --- any past balance, and its explanation
{
  const who = "w123";
  let running = 0, checks = 0;
  const s = empty();
  for (const e of p.log) {
    apply(s, e);
    if (e.type === "Deposited" && e.account === who) running += e.amount;
    if (e.type === "Transferred") { if (e.from === who) running -= e.amount; if (e.to === who) running += e.amount; }
    if ((e.type === "Transferred" && (e.from === who || e.to === who)) || (e.type === "Deposited" && e.account === who)) { assert.equal(s.balances.get(who), running); checks += 1; }
  }
  console.log(`wallet ${who}: its balance after each of its ${checks} events equals the sum of the events so far`);
}

// --- determinism: an apply() that reads the clock gives each replica a different state
{
  const feeByClock = (s: State, e: Event, now: number): State => {
    apply(s, e);
    if (e.type === "Transferred" && now % 2 === 0) s.balances.set(e.from, (s.balances.get(e.from) ?? 0) - 1);   // "fee waived on odd seconds"
    return s;
  };
  const a = empty(), b = empty();
  p.log.forEach((e, i) => { feeByClock(a, e, 1_792_000_000 + Math.floor(i / 1000)); feeByClock(b, e, 1_792_000_000 + Math.floor((i + 500) / 1000)); });
  console.log(`two replicas applying the same events with a fee that depends on the clock: ${stateHash(a)} and ${stateHash(b)}`);
  assert.notEqual(stateHash(a), stateHash(b));
}

// --- across partitions, while the process moving the money crashes now and then
for (const rate of [0.001, 0.01]) {
  for (const how of ["debit, then credit", "saga"] as const) {
    const r = crossPartition(how, 100_000, rate, 7);
    console.log(`  ${how}, crash rate ${rate * 100}%: ${fmt(r.crashes)} crashes, ${fmt(r.lost)} transfers lost (${fmt(r.lostCents / 100)} in money), ${fmt(r.duplicatesIgnored)} repeated deliveries ignored, ${r.returned} returned to closed accounts' senders; money conserved: ${r.conserved}`);
    if (how === "saga") { assert.ok(r.conserved); assert.equal(r.lost, 0); } else assert.ok(!r.conserved && r.lost > 0);
  }
}

// --- what others wait for: 100,000 transfers at 1,000 a second, a tenth to one merchant, coordinator crashes 0.1%
for (const protocol of PROTOCOLS) {
  const w = waits(protocol, 100_000, 1000, 0.001, 5000, 3);
  console.log(`  ${protocol}: ${w.crashes} crashes; ${fmt(w.delayed)} transfers waited for a lock (${fmt(w.delayedOverSecond)} over a second, ${fmt(w.meanWaitMs)} ms on average); money frozen ${fmt(w.frozenCentSeconds / 100)} unit-seconds; in flight ${fmt(w.inFlightCentSeconds / 100)} unit-seconds`);
}
const clone = cloneState(p.state);
assert.equal(stateHash(clone), stateHash(p.state));
console.log("ok");
