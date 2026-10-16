import assert from "node:assert/strict";
import { generate, type Click } from "./clicks.ts";
import { seeded } from "./rng.ts";
import { WindowedCounter, latest, type StreamConfig } from "./stream.ts";
import { recount, reconcile } from "./batch.ts";
import { withCrashes } from "./crash.ts";
import { skew } from "./skew.ts";

const MIN = 60_000, HOUR = 3_600_000;
const clicks = generate(seeded(1));
const truth = recount(clicks, MIN);
const run = (c: StreamConfig) => { const s = new WindowedCounter(c); for (const k of clicks) s.add(k); s.finish(Infinity); return s; };

{
  const copies = clicks.length - 600_000;
  const byAd = new Map<number, number>();
  for (const c of clicks) byAd.set(c.ad, (byAd.get(c.ad) ?? 0) + 1);
  const top = Math.max(...byAd.values());
  const late = clicks.filter((c) => c.arrival - c.time > MIN).length;
  console.log(`600,000 clicks on 20,000 ads over 2 hours, plus ${copies.toLocaleString("en-US")} repeated copies; the most clicked ad has ${(top / clicks.length * 100).toFixed(1)}%; ${late.toLocaleString("en-US")} copies arrive more than a minute after the click`);
  console.log(`the batch recount: ${truth.size.toLocaleString("en-US")} (ad, minute) counts`);
}

// --- the watermark: how long to wait before the first result, and what that costs
for (const delayMs of [0, 10_000, 60_000]) {
  const s = run({ windowMs: MIN, delayMs, graceMs: 0, dedupMs: 10 * MIN });
  const share = s.stats.counted / 600_000;
  console.log(`watermark ${delayMs / 1000} s behind, late clicks dropped: ${(share * 100).toFixed(2)}% of clicks counted, ${s.stats.dropped.toLocaleString("en-US")} dropped`);
  assert.ok(s.stats.dropped > 0);
}

// --- the chosen design: results after 10 s, corrections for 2 hours, ids remembered for 10 minutes
{
  const s = run({ windowMs: MIN, delayMs: 10_000, graceMs: 2 * HOUR, dedupMs: 10 * MIN });
  const firsts = s.results.filter((r) => r.kind === "first").length;
  const r = reconcile(latest(s.results), truth);
  console.log(`design: ${firsts.toLocaleString("en-US")} first results, ${s.stats.corrections.toLocaleString("en-US")} corrections, ${s.stats.dropped} dropped, ${s.stats.duplicates.toLocaleString("en-US")} copies removed, at most ${s.stats.dedupPeak.toLocaleString("en-US")} ids remembered`);
  console.log(`reconciliation against the recount: ${r.matching.toLocaleString("en-US")} of ${r.keys.toLocaleString("en-US")} counts equal; ${r.missing} clicks missing; ${r.extra.toLocaleString("en-US")} extra in ${r.keysExtra.toLocaleString("en-US")} counts`);
  assert.equal(s.stats.dropped, 0);
  assert.equal(r.missing, 0);
  // every extra click is a copy that arrived more than 10 minutes after the first copy of the same click
  const first = new Map<number, number>();
  let tooLate = 0;
  for (const c of clicks) { const f = first.get(c.id); if (f === undefined) first.set(c.id, c.arrival); else if (c.arrival - f >= 10 * MIN) tooLate += 1; }
  assert.equal(r.extra, tooLate);
}

// --- how long to remember click ids
for (const dedupMs of [0, MIN, 10 * MIN, HOUR, 7 * HOUR]) {
  const s = run({ windowMs: MIN, delayMs: 10_000, graceMs: 2 * HOUR, dedupMs });
  const r = reconcile(latest(s.results), truth);
  console.log(`ids remembered ${String(dedupMs / MIN).padStart(3)} min: ${r.extra.toLocaleString("en-US").padStart(6)} clicks counted twice, ${s.stats.dedupPeak.toLocaleString("en-US")} ids held at most`);
  if (dedupMs === 7 * HOUR) { assert.equal(r.extra, 0); assert.equal(r.matching, r.keys); }   // long enough for every copy: identical to the batch
}

// --- crashes: the order of the consumer's steps decides what a crash does
{
  const seen = new Set<number>();
  const log = clicks.filter((c: Click) => !seen.has(c.id) && seen.add(c.id) !== undefined);
  for (const st of ["commit-first", "write-then-commit", "checkpoint"] as const) {
    const r = withCrashes(log, st, 20, 5);
    console.log(`${st.padEnd(17)} 20 crashes: counted ${r.counted.toLocaleString("en-US")} of ${r.truth.toLocaleString("en-US")}; ${r.keysWrong.toLocaleString("en-US")} counts wrong`);
    if (st === "checkpoint") { assert.equal(r.counted, r.truth); assert.equal(r.keysWrong, 0); }
    else assert.notEqual(r.counted, r.truth);
  }
}

// --- hot ads: 2 million ads, 11,574 clicks a second (1 billion a day), 32 partitions, 50 click servers
{
  const plain = skew(11_574, 20, 2_000_000, 1.0, 32, 50, false);
  const combined = skew(11_574, 20, 2_000_000, 1.0, 32, 50, true);
  console.log(`hot partition: ${(plain.busiestShare * 100).toFixed(1)}% of messages against an average of ${(plain.averageShare * 100).toFixed(1)}%; combining per server and second: ${(combined.busiestShare * 100).toFixed(1)}%, and ${((1 - combined.messages / plain.messages) * 100).toFixed(0)}% fewer messages`);
  assert.ok(plain.busiestShare > 2 * plain.averageShare && combined.busiestShare < 1.5 * combined.averageShare);
}
console.log("all click aggregation tests passed");
