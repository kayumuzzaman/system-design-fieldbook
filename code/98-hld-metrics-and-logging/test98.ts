import assert from "node:assert/strict";
import { Chunk } from "./gorilla.ts";
import { seeded } from "./rng.ts";
import { mix, series, type Kind } from "./series.ts";
import { coarsen, downsample, exactQuantile, histogram, quantileOf } from "./rollup.ts";
import { averaged, evaluate, INCIDENT, latencyDay } from "./alert.ts";
import { perSecond } from "./scrape.ts";
import { chunked, fullIndexBytes, labelIndexBytes, logLines, scan } from "./logs.ts";

// --- compression: every chunk decodes to exactly what went in; bytes per sample by kind of series
const perKind: Record<string, number> = {};
for (const jitter of [0, 5]) {
  let weighted = 0;
  const row: string[] = [];
  for (const kind of Object.keys(mix) as Kind[]) {
    const random = seeded(7);
    let bytes = 0, samples = 0;
    for (let s = 0; s < 300; s += 1) {
      const points = series(random, kind, 480, jitter);          // two hours at one sample every 15 s
      const c = new Chunk();
      for (const [t, v] of points) c.append(t, v);
      if (s < 20) assert.deepEqual(Chunk.decode(c.bytes(), points.length), points);
      bytes += c.bytes().length; samples += points.length;
    }
    perKind[`${kind}/${jitter}`] = bytes / samples;
    weighted += mix[kind] * (bytes / samples);
    row.push(`${kind} ${(bytes / samples).toFixed(2)}`);
  }
  perKind[`mix/${jitter}`] = weighted;
  console.log(`bytes per sample, timestamps ${jitter ? "jittered by up to 5 ms" : "exactly 15 s apart"}: ${row.join(", ")}; the assumed mix ${weighted.toFixed(2)} (raw: 16)`);
}
assert.ok((perKind["mix/0"] as number) < 3 && (perKind["constant/0"] as number) < 0.5 && (perKind["gauge-float/0"] as number) > 6);

// --- downsampling: rollups of rollups equal rollups of the raw points
{
  const day = series(seeded(9), "gauge-float", 5760, 0, Date.UTC(2026, 9, 13));
  const five = downsample(day, 300_000), hour = downsample(day, 3_600_000);
  assert.equal(day.length, 5760); assert.equal(five.length, 288); assert.equal(hour.length, 24);
  const viaFive = coarsen(five, 3_600_000);
  hour.forEach((h, i) => {
    const v = viaFive[i] as typeof h;
    assert.equal(v.min, h.min); assert.equal(v.max, h.max); assert.equal(v.count, h.count);
    assert.ok(Math.abs(v.sum - h.sum) < 1e-9);
  });
  console.log("one series for a day: 5,760 raw samples, 288 five-minute rollups, 24 hourly; hourly from five-minute rollups equals hourly from raw");
}

// --- percentiles do not roll up; histograms do
{
  const random = seeded(5);
  const g = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const minutes: number[][] = [];
  for (let m = 0; m < 60; m += 1) {
    const v: number[] = [];
    for (let i = 0; i < 2000; i += 1) v.push(m >= 20 && m < 25 && random() < 0.3 ? 800 * Math.exp(0.3 * g()) : 40 * Math.exp(0.5 * g()));
    minutes.push(v);
  }
  const truth = exactQuantile(minutes.flat(), 0.99);
  const p99s = minutes.map((v) => exactQuantile(v, 0.99));
  const mean = p99s.reduce((a, b) => a + b, 0) / p99s.length;
  const merged = minutes.map(histogram).reduce((a, b) => a.map((x, i) => x + (b[i] as number)));
  const fromHist = quantileOf(merged, 0.99);
  console.log(`an hour of 120,000 requests, 5 slow minutes: true 99th percentile ${truth.toFixed(0)} ms; average of the 60 minute percentiles ${mean.toFixed(0)} ms; largest ${Math.max(...p99s).toFixed(0)} ms; from the merged histograms ${fromHist.toFixed(0)} ms`);
  assert.ok(mean < truth / 2 && Math.abs(fromHist - truth) / truth < 0.1);
}

// --- alerting on a noisy day with one real 20-minute incident
{
  const day = latencyDay(seeded(3));
  const rules: [string, [number, number][], number][] = [
    ["each sample above 300 ms", day, 0], ["above 300 ms for 1 minute", day, 60_000],
    ["above 300 ms for 5 minutes", day, 300_000], ["5-minute average above 300 ms", averaged(day, 300_000), 0]];
  for (const [name, points, forMs] of rules) {
    const o = evaluate(points, { threshold: 300, forMs, keepMs: 0 });
    const real = o.fired.filter((t) => t >= INCIDENT.start && t < INCIDENT.end + 300_000);
    console.log(`${name.padEnd(30)} ${String(o.notifications).padStart(2)} notifications, ${real.length} during the incident, ${o.notifications - real.length} false; first ${real.length ? `${(real[0] as number - INCIDENT.start) / 1000} s` : "never"} after it began`);
  }
  const best = evaluate(averaged(day, 300_000), { threshold: 300, forMs: 0, keepMs: 0 });
  assert.equal(best.notifications, 1);
  assert.equal(evaluate(day, { threshold: 300, forMs: 300_000, keepMs: 0 }).notifications, 0);   // "for 5m" never fires: each dip resets it
}

// --- scraping 10,000 targets every 15 s
{
  for (const sch of ["aligned", "hashed"] as const) {
    const p = perSecond(10_000, 15_000, 1000, sch);
    const avg = p.reduce((a, b) => a + b, 0) / p.length;
    console.log(`scrapes ${sch}: busiest second ${(Math.max(...p) / avg).toFixed(2)} times the average`);
  }
}

// --- logs: compressed chunks with a label index, or an index of every word
{
  const lines = logLines(seeded(11), 200_000);
  const store = chunked(lines);
  const full = fullIndexBytes(lines);
  console.log(`200,000 log lines, ${(store.rawBytes / 1e6).toFixed(1)} MB: compressed chunks ${(store.chunkBytes / 1e6).toFixed(1)} MB (${(store.rawBytes / store.chunkBytes).toFixed(1)} times smaller); index of every word ${(full.bytes / 1e6).toFixed(1)} MB, ${full.terms.toLocaleString("en-US")} terms; label index ${(labelIndexBytes(store) / 1000).toFixed(1)} KB`);
  const target = lines[123_456] as (typeof lines)[number];
  const id = (JSON.parse(target.text) as { trace_id: string }).trace_id;
  const found = scan(store, target.service, id);
  assert.deepEqual(found.lines, [target.text]);
  assert.deepEqual(full.postings.get(id), [123_456]);
  console.log(`one trace id, found by scanning one service's chunks (${(found.bytesRead / 1e6).toFixed(1)} MB decompressed) and by the word index`);
}
console.log("all monitoring tests passed");
