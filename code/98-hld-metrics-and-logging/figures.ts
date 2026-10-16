// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { Chunk } from "./gorilla.ts";
import { seeded } from "./rng.ts";
import { exactQuantile, histogram, quantileOf } from "./rollup.ts";
import { averaged, evaluate, INCIDENT, latencyDay } from "./alert.ts";
import { chunked, fullIndexBytes, labelIndexBytes, logLines } from "./logs.ts";

// five samples of a request counter, with the bits each costs
const t0 = Date.UTC(2026, 9, 13, 12);
const samples: [number, number][] = [[t0, 1000], [t0 + 15_000, 1012], [t0 + 30_000, 1012], [t0 + 45_002, 1030], [t0 + 60_000, 1031]];
const c = new Chunk();
const bits = samples.map(([t, v]) => { const a = { ...c.bitsFor }; c.append(t, v); return { t, v, time: c.bitsFor.time - a.time, value: c.bitsFor.value - a.value }; });

// an hour of request latencies: the 99th percentile of each minute, and of the hour
const random = seeded(5);
const g = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const minutes: number[][] = [];
for (let m = 0; m < 60; m += 1) {
  const v: number[] = [];
  for (let i = 0; i < 2000; i += 1) v.push(m >= 20 && m < 25 && random() < 0.3 ? 800 * Math.exp(0.3 * g()) : 40 * Math.exp(0.5 * g()));
  minutes.push(v);
}
const p99s = minutes.map((v) => exactQuantile(v, 0.99));
const percentiles = { minute: p99s, truth: exactQuantile(minutes.flat(), 0.99), mean: p99s.reduce((a, b) => a + b, 0) / 60, histogram: quantileOf(minutes.map(histogram).reduce((a, b) => a.map((x, i) => x + (b[i] as number))), 0.99) };

// the noisy day: the highest sample of each minute, and when each rule notified
const day = latencyDay(seeded(3));
const perMinute = Array.from({ length: 1440 }, (_, m) => Math.max(...day.slice(m * 4, m * 4 + 4).map((p) => p[1])));
const rules = { plain: evaluate(day, { threshold: 300, forMs: 0, keepMs: 0 }).fired, for1: evaluate(day, { threshold: 300, forMs: 60_000, keepMs: 0 }).fired,
  for5: evaluate(day, { threshold: 300, forMs: 300_000, keepMs: 0 }).fired, avg5: evaluate(averaged(day, 300_000), { threshold: 300, forMs: 0, keepMs: 0 }).fired };

const lines = logLines(seeded(11), 200_000);
const store = chunked(lines);
const logs = { raw: store.rawBytes, chunks: store.chunkBytes, words: fullIndexBytes(lines).bytes, labels: labelIndexBytes(store) };
console.log(JSON.stringify({ bits, percentiles, perMinute, rules, incident: INCIDENT, logs }));
