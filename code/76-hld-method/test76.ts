import assert from "node:assert/strict";
import { EXPIRY_MIX, PASTEBIN, estimate, grow, meanLifetimeDays } from "./estimate.ts";
import { liveByDay } from "./expiry.ts";
import { hitRatioOf, readPath, reuseDistances } from "./readpath.ts";
import { generate, MODEL } from "./workload.ts";

const close = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const GB = 1e9, PASTE = PASTEBIN.pasteKb * 1000;

// --- Step 2: the estimate
{
  close(meanLifetimeDays(EXPIRY_MIX), 27.004, 0.001, "average lifetime in days");
  const e = estimate(PASTEBIN);
  assert.equal(e.pastesPerDay, 500_000);
  assert.equal(e.readsPerDay, 10_000_000);
  assert.equal(e.readsPerPaste, 20);
  close(e.writesPerSecond, 5.79, 0.01, "writes a second");
  close(e.readsPerSecond, 115.7, 0.1, "reads a second");
  close(e.peakWrites, 17.4, 0.1, "peak writes");
  close(e.peakReads, 347, 1, "peak reads");
  assert.equal(e.livePastes, 13_500_000);
  assert.equal(e.textBytes, 135 * GB);
  assert.equal(e.metadataBytes, 4.05 * GB);
  close(e.egressBitsPerSecond / 1e6, 9.26, 0.01, "Mbit/s out");
  close(e.peakEgressBitsPerSecond / 1e6, 27.8, 0.1, "peak Mbit/s out");
  close(e.ingressBitsPerSecond / 1e6, 0.463, 0.001, "Mbit/s in");
  assert.equal(e.oneDayOfPastesBytes, 5 * GB);
  console.log(`estimate: ${e.writesPerSecond.toFixed(1)} writes/s (peak ${e.peakWrites.toFixed(0)}), ${e.readsPerSecond.toFixed(0)} reads/s (peak ${e.peakReads.toFixed(0)}), ` +
    `${e.livePastes / 1e6}M live pastes, ${e.textBytes / GB} GB text, ${e.metadataBytes / GB} GB rows, ${(e.egressBitsPerSecond / 1e6).toFixed(1)} Mbit/s out (peak ${(e.peakEgressBitsPerSecond / 1e6).toFixed(1)})`);
  for (const f of [10, 100]) {
    const g = estimate(grow(PASTEBIN, f));
    console.log(`x${f}: ${g.writesPerSecond.toFixed(0)} writes/s (peak ${g.peakWrites.toFixed(0)}), peak reads ${g.peakReads.toFixed(0)}/s, ` +
      `${g.textBytes / 1e12} TB text, ${g.metadataBytes / GB} GB rows, peak out ${(g.peakEgressBitsPerSecond / 1e9).toFixed(2)} Gbit/s, one day of pastes ${g.oneDayOfPastesBytes / GB} GB`);
  }
}

// --- Step 6: the read path. Two ways of measuring the same LRU cache must agree exactly: replaying every request
// through the cache, and the reuse distances that answer for every size at once.
{
  const small = generate({ ...MODEL, pastesPerDay: 5_000, days: 6, seed: 7 });
  for (const fill of ["on a miss", "on create too"] as const) {
    const d = reuseDistances(small, fill, 2);
    for (const capacity of [500, 2_000, 5_000]) {
      const replayed = readPath(small, { capacity, fill, measureFromDay: 2, flushAtDay: 4 });
      const fast = hitRatioOf(d, capacity, 2 * 86_400, 4 * 86_400);
      assert.equal(fast.hitRatio, replayed.hitRatio, `${fill}, ${capacity} entries`);
      assert.deepEqual(fast.hourly.slice(0, 96), replayed.hourly.slice(0, 96));
    }
  }
  console.log("replay and reuse distances agree: 2 fills x 3 sizes, with the cache emptied on day 4");
}

// At a tenth of the real rate, with cache sizes scaled to match. Day 0 and 1 warm the cache; days 2 to 5 are measured.
const SCALE = 0.1;
const entries = (gb: number) => Math.round((gb * GB / PASTE) * SCALE);
const w = generate({ ...MODEL, pastesPerDay: 500_000 * SCALE, days: 6, seed: 76 });
const onMiss = reuseDistances(w, "on a miss", 2);
const onCreate = reuseDistances(w, "on create too", 2);
const from = 2 * 86_400;
{
  let drawn = 0;
  for (const k of w.readsPerPasteDrawn) drawn += k;
  close(drawn / w.pastes, 20, 1, "reads drawn per paste");
  const sorted = Array.from(w.readsPerPasteDrawn).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] as number;
  const neverRead = sorted.filter((k) => k === 0).length / sorted.length;
  const most = sorted[sorted.length - 1] as number;
  const first = readPath(w, { capacity: 1, fill: "on a miss", measureFromDay: 2 }).firstReads;
  const firstShare = first / onMiss.distance.length;
  close(firstShare, 0.04, 0.005, "share of reads that are a paste's first");
  console.log(`workload: ${w.pastes} pastes, ${onMiss.distance.length} reads measured, ${(drawn / w.pastes).toFixed(1)} reads per paste on average, median ${median}, ` +
    `${pct(neverRead)} never read, most-read paste ${most}; first reads are ${pct(firstShare)} of reads`);

  const rows: string[] = [];
  for (const gb of [0.25, 0.5, 1, 2, 5, 10, 20]) {
    const a = hitRatioOf(onMiss, entries(gb), from).hitRatio, b = hitRatioOf(onCreate, entries(gb), from).hitRatio;
    assert.ok(a <= 1 - firstShare + 1e-12, "filling on a miss can never answer a first read");
    rows.push(`${gb} GB: on a miss ${pct(a)}, on create too ${pct(b)}`);
  }
  console.log("hit ratio by cache size\n  " + rows.join("\n  "));
  const at5 = hitRatioOf(onCreate, entries(5), from).hitRatio;
  assert.ok(at5 > 0.99, "one day of new pastes in the cache keeps misses under 1%");
  assert.ok(hitRatioOf(onMiss, entries(5), from).hitRatio < 0.96);
  const peak = estimate(PASTEBIN).peakReads;
  console.log(`at 5 GB, store reads at peak: ${(peak * (1 - hitRatioOf(onMiss, entries(5), from).hitRatio)).toFixed(1)}/s filling on a miss, ${(peak * (1 - at5)).toFixed(1)}/s filling on create too, of ${peak.toFixed(0)}/s`);

  // The cache is emptied at the start of day 4, as if its only server restarted.
  const flushed = hitRatioOf(onCreate, entries(5), from, 4 * 86_400).hourly.slice(48);
  const back = flushed.findIndex((h, i) => i > 0 && h >= 0.99 && (flushed[i + 1] ?? 1) >= 0.99);
  assert.ok((flushed[0] as number) < 0.8 && back > 3);
  console.log(`cache emptied: first hour ${pct(flushed[0] as number)}, then ${flushed.slice(1, 4).map(pct).join(", ")}; back above 99% from hour ${back + 1}`);
}

// --- Step 6: expiry. Live pastes level off at arrivals x average lifetime, but only after the longest lifetime.
{
  const perDay = 5_000; // a hundredth of the real rate
  const live = liveByDay(perDay, 400, EXPIRY_MIX, 76);
  const shortLived = EXPIRY_MIX.filter((c) => c.days < 365).reduce((s, c) => s + c.share * c.days, 0);
  close(live[30] as number, perDay * (shortLived + 0.05 * 30), perDay * 0.3, "live after 30 days");
  close(live[400] as number, perDay * meanLifetimeDays(EXPIRY_MIX), perDay * 0.3, "live after 400 days");
  console.log(`live pastes (x100 for the real rate): day 7 ${(live[7] as number) * 100}, day 30 ${(live[30] as number) * 100}, day 180 ${(live[180] as number) * 100}, day 365 ${(live[365] as number) * 100}, day 400 ${(live[400] as number) * 100}`);
}
