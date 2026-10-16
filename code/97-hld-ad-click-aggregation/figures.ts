// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { generate, type Click } from "./clicks.ts";
import { seeded } from "./rng.ts";
import { WindowedCounter, latest } from "./stream.ts";
import { recount, reconcile } from "./batch.ts";
import { withCrashes } from "./crash.ts";
import { skew } from "./skew.ts";

const MIN = 60_000;
// a short trace for one ad: seconds after 12:00:00, as [id, event time, arrival time]
const trace: [number, number, number][] = [[1, 5, 5.4], [2, 40, 40.3], [3, 58, 63], [4, 66, 66.2], [5, 72, 72.3], [2, 40, 80], [6, 30, 95]];
const w = new WindowedCounter({ windowMs: MIN, delayMs: 10_000, graceMs: 2 * 3_600_000, dedupMs: 10 * MIN });
const steps = trace.map(([id, t, a]) => {
  const before = { ...w.stats }, n = w.results.length;
  w.add({ id, ad: 7, time: t * 1000, arrival: Math.round(a * 1000) });
  const what = w.stats.duplicates > before.duplicates ? "duplicate" : w.stats.dropped > before.dropped ? "dropped" : w.stats.corrections > before.corrections ? "correction" : "counted";
  return { id, time: t, arrival: a, what, emitted: w.results.slice(n), watermark: (w as unknown as { watermark: number }).watermark / 1000 };
});

const clicks = generate(seeded(1));
const truth = recount(clicks, MIN);
const watermark = [0, 1, 5, 10, 30, 60, 120, 300, 600].map((d) => {
  const s = new WindowedCounter({ windowMs: MIN, delayMs: d * 1000, graceMs: 0, dedupMs: 10 * MIN });
  for (const c of clicks) s.add(c);
  s.finish(Infinity);
  const waits = s.results.map((r) => r.at - (r.window + MIN)).sort((a, b) => a - b);
  const r = reconcile(latest(s.results), truth);
  return { delay: d, counted: s.stats.counted, dropped: s.stats.dropped, medianWaitMs: waits[waits.length >> 1], countsEqual: r.matching, counts: r.keys };
});
const seen = new Set<number>();
const log = clicks.filter((c: Click) => !seen.has(c.id) && seen.add(c.id) !== undefined);
const crashes = (["commit-first", "write-then-commit", "checkpoint"] as const).map((st) => withCrashes(log, st, 20, 5));
const hot = { plain: skew(11_574, 20, 2_000_000, 1.0, 32, 50, false), combined: skew(11_574, 20, 2_000_000, 1.0, 32, 50, true) };
console.log(JSON.stringify({ steps, watermark, crashes, hot }));
