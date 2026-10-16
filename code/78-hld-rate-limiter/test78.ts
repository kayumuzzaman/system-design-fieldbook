import assert from "node:assert/strict";
import { tokenBucket } from "./algorithms.ts";
import { AtomicScript, ReadThenWrite } from "./limiters.ts";
import type { Limiter } from "./limiters.ts";
import * as X from "./experiments.ts";
import { Rng } from "./rng.ts";
import { Sim } from "./sim.ts";
import { CounterStore } from "./store.ts";

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// The store runs commands one at a time, in the order they arrive.
{
  const sim = new Sim();
  const store = new CounterStore(sim, new Rng(1));
  const seen: number[] = [];
  for (let i = 0; i < 50; i++) store.incrBy("k", 1, (total) => seen.push(total));
  sim.run(Infinity);
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));
  console.log("store: 50 increments sent at once give totals 1 to 50, each exactly once");
}

// Twenty requests at the same instant, one per server, against a bucket of ten.
{
  const burst = (make: (sim: Sim, store: CounterStore) => Limiter) => {
    const sim = new Sim();
    const store = new CounterStore(sim, new Rng(2));
    const fleet = Array.from({ length: 20 }, () => make(sim, store));
    let allowed = 0;
    for (const server of fleet) server.handle("ana", (o) => (allowed += o.allowed ? 1 : 0));
    sim.run(Infinity);
    return allowed;
  };
  const racy = burst((sim, store) => new ReadThenWrite(sim, store, tokenBucket(10, 1000)));
  const atomic = burst((sim, store) => new AtomicScript(sim, store, tokenBucket(10, 1000)));
  assert.equal(atomic, 10);
  assert.ok(racy > 10);
  console.log(`burst of 20 against a bucket of 10, from 20 servers: read then write allowed ${racy}, the script allowed ${atomic}`);
}

// A. The race under steady load.
const race = X.race();
for (const r of race) {
  console.log(`offered ${r.rate}/s: read then write let through ${f1(r.readThenWrite.allowedPerSecond)}/s (median ${r.readThenWrite.medianMs.toFixed(2)} ms), ` +
    `the script ${f1(r.script.allowedPerSecond)}/s (median ${r.script.medianMs.toFixed(2)} ms, 99th percentile ${r.script.p99Ms.toFixed(2)} ms)`);
  if (r.rate >= 500) assert.ok(Math.abs(r.script.allowedPerSecond - 100) <= 1, "the script holds the limit");
  if (r.rate >= 1000) assert.ok(r.readThenWrite.allowedPerSecond > 150, "read then write lets far more through");
}

// B. Local shares.
for (const r of X.localShares()) {
  console.log(`${r.servers} servers, a local share each: a client at its limit served ${pct(r.atLimitServed)}, ` +
    `on one connection ${pct(r.oneConnectionServed)}, a client at 10 times its limit gets ${f1(r.abusivePerSecond)}/s`);
  assert.ok(r.abusivePerSecond <= 100 + 1e-9);
}

// C. Counting locally and syncing.
for (const r of X.syncIntervals()) {
  console.log(`${r.syncMs === 0 ? "every request in the store" : `sync every ${r.syncMs} ms`}: a client at 10 times the limit gets ${f1(r.abusivePerSecond)}/s, ` +
    `a client at 80% served ${pct(r.normalServed)}, store commands ${Math.round(r.storeCommandsPerSecond)}/s`);
  assert.equal(r.normalServed, 1);
}

// D. The store goes down for 30 seconds.
const o = X.outage();
for (const r of o.runs) {
  console.log(`store down, ${r.policy}${r.breaker ? " with a breaker" : ""}: normal client served ${pct(r.normalServedDuring)}, abusive client ${f1(r.abusiveDuring)}/s, ` +
    `decisions waiting the full ${o.timeoutMs} ms timeout ${pct(r.waitedDuring)}`);
}
const [open, closed, local, breaker] = o.runs;
assert.ok(open!.abusiveDuring > 900 && closed!.normalServedDuring === 0 && local!.abusiveDuring <= 101 && local!.normalServedDuring > 0.99);
assert.ok(breaker!.waitedDuring < 0.1 && local!.waitedDuring > 0.99);
console.log("all tests passed");
