import assert from 'node:assert/strict';
import { ABR_EXPERIMENT, LADDER, PLAYERS, population, measure, type AbrResult } from './abr.ts';
import { CDN, simulateCdn } from './cdn.ts';
import { TODAY, estimate, grow } from './estimates.ts';
import { LADDER_COST, complexity, transcode } from './transcode.ts';

const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const si = (x: number, unit: string) => {
  const p = ['', 'k', 'M', 'G', 'T', 'P', 'E'];
  let i = 0;
  while (Math.abs(x) >= 1000 && i < p.length - 1) { x /= 1000; i++; }
  return `${x.toPrecision(3)} ${p[i]}${unit}`;
};

// 1. Step 2, and the same at ten and a hundred times.
console.log(`ladder: ${LADDER.length} rungs, ${n(LADDER.reduce((a, r) => a + r.kbps, 0))} kbit/s in all; encoding all of them costs ${LADDER_COST.toFixed(2)} core-seconds per second of video`);
for (const f of [1, 10, 100]) {
  const e = estimate(grow(TODAY, f));
  console.log(`\nx${f}: ${n(e.watchHoursPerDay / 1e6, 1)} million hours watched a day; ${n(e.concurrentPeak / 1e6, 1)} million watching at peak`);
  console.log(`  delivery ${si(e.egressPeakBits, 'bit/s')} at peak, ${si(e.egressPerDay, 'B')} a day; ${n(e.segmentRequestsPeak / 1e6, 2)} million segment requests and ${n(e.heartbeatsPeak)} playback events a second; origin ${si(e.originPeakBits, 'bit/s')} at a ${TODAY.hit * 100}% hit ratio`);
  console.log(`  uploads ${n(e.uploadHoursPerMinute, 1)} hours of video a minute, ${si(e.ingestPerDay, 'B')} a day in; stored ${si(e.storedPerDay, 'B')} a day, ${si(e.storedPerYear, 'B')} a year; ${n(e.encodeCores)} cores encoding; ${n(e.outOverIn)} bytes out for each byte in`);
}
const today = estimate(TODAY);
assert.ok(Math.abs(today.egressPeakBits - 33.3e12) < 0.1e12);
assert.ok(today.outOverIn > 100);

// 2. Adaptive bitrate: 400 viewers, half on fixed lines and half on mobile, 10 minutes of video each.
const people = population(ABR_EXPERIMENT.viewers, ABR_EXPERIMENT.segments, ABR_EXPERIMENT.seed);
console.log(`\nadaptive bitrate: ${people.length} viewers, ${ABR_EXPERIMENT.segments} segments of 6 s each`);
console.log('player                                     viewers     frozen  stalled  bitrate  1st min  switches  startup');
const results: AbrResult[] = [];
for (const make of PLAYERS) {
  for (const r of measure(make, people)) {
    results.push(r);
    console.log(`${r.name.padEnd(42)} ${r.kind.padEnd(10)} ${r.rebufferPercent.toFixed(2).padStart(6)}%  ${(r.withStall * 100).toFixed(1).padStart(5)}%  ${n(r.meanKbps).padStart(7)}  ${n(r.firstMinuteKbps).padStart(7)}  ${r.switchesPerSession.toFixed(1).padStart(8)}  ${r.medianStartup.toFixed(2).padStart(6)} s`);
  }
}
const all = (name: string) => results.find((r) => r.kind === 'all' && r.name === name) as AbrResult;
const tp = results.filter((r) => r.kind === 'all' && r.name.startsWith('throughput')).sort((a, b) => a.rebufferPercent - b.rebufferPercent);
// For each buffer-based setting, the bitrate a throughput-based player would have had with the same frozen time.
for (const b of results.filter((r) => r.kind === 'all' && r.name.startsWith('buffer-based'))) {
  const i = tp.findIndex((t) => t.rebufferPercent >= b.rebufferPercent);
  if (i <= 0) { console.log(`${b.name}: outside the throughput-based range`); continue; }
  const lo = tp[i - 1] as AbrResult, hi = tp[i] as AbrResult;
  const same = lo.meanKbps + (hi.meanKbps - lo.meanKbps) * (b.rebufferPercent - lo.rebufferPercent) / (hi.rebufferPercent - lo.rebufferPercent);
  console.log(`${b.name}: ${n(b.meanKbps)} kbit/s; throughput-based with the same frozen time ${n(same)} kbit/s; ratio ${(b.meanKbps / same).toFixed(2)}`);
}
const tpDefault = all('throughput-based, 95% of the estimate'), bbDefault = all('buffer-based, reservoir 24 s');
assert.ok(bbDefault.meanKbps > tpDefault.meanKbps);
assert.ok(all('fixed 3,000 kbit/s').rebufferPercent > 10 * tpDefault.rebufferPercent);

// 3. Transcoding one 10-minute upload into the nine rungs.
const scenes = complexity(600, 85);
const workers = [1, 8, 32, 128, 512];
console.log(`\ntranscoding a 10-minute video, wall time in minutes for ${workers.join(', ')} workers, and the work done`);
const wall: Record<string, number[]> = {};
for (const chunk of ['whole', 60, 30, 6] as const) {
  const runs = workers.map((w) => transcode(600, { chunk, workers: w, order: 'largest first' }, scenes));
  wall[String(chunk)] = runs.map((r) => r.wall);
  console.log(`  ${(chunk === 'whole' ? 'whole file per rung' : `${chunk}-second chunks`).padEnd(20)} ${runs.map((r) => (r.wall / 60).toFixed(1).padStart(6)).join('')}   ${(runs[0]?.coreSeconds as number / 3600).toFixed(2)} core-hours, ${runs[0]?.jobs} jobs`);
}
for (const order of ['largest first', 'lowest rungs first'] as const) {
  const r = transcode(600, { chunk: 30, workers: 32, order }, scenes);
  console.log(`  30-second chunks, 32 workers, ${order}: playable at three rungs after ${(r.playable / 60).toFixed(1)} min, all rungs after ${(r.wall / 60).toFixed(1)} min`);
}
assert.ok((wall['6']?.[4] as number) < (wall['whole']?.[4] as number) / 10);
assert.equal(wall['whole']?.[3], wall['whole']?.[4]);   // more workers than jobs: nothing to gain

// 4. Delivery: edges caching on demand, a shield behind them, and edges filled in advance from a forecast.
const cdn = simulateCdn(CDN, [0.5, 1, 2, 5, 10, 20]);
console.log(`\ncdn: ${n(CDN.videos)} videos (Zipf ${CDN.zipf}), ${si(cdn.catalogBytes, 'B')} in three renditions; ${n(CDN.views)} views, ${n(cdn.requests)} segment requests over ${CDN.edges} edges`);
console.log('  edge size   edge only   edge + shield   filled from a forecast   origin sends');
for (const r of cdn.rows) {
  console.log(`  ${(r.edgePercent + '%').padStart(9)}   ${(r.edgeHit * 100).toFixed(1).padStart(8)}%   ${(r.withShield * 100).toFixed(1).padStart(12)}%   ${(r.forecast * 100).toFixed(1).padStart(21)}%   ${((1 - r.withShield) * 100).toFixed(1).padStart(10)}%`);
  assert.ok(r.withShield >= r.edgeHit);
}
console.log('\nall checks passed');
