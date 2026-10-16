// Prints the data behind the chapter's charts as JSON: node lld/ts85/figures.ts > ch85/figures.json
import { ABR_EXPERIMENT, BufferBased, LADDER, ThroughputBased, play, population, type Session } from './abr.ts';
import { CDN, simulateCdn } from './cdn.ts';

// One mobile viewer from the experiment, played by the two default players.
const VIEWER = 19;
const people = population(ABR_EXPERIMENT.viewers, ABR_EXPERIMENT.segments, ABR_EXPERIMENT.seed);
const viewer = people[VIEWER];
if (!viewer) throw new Error('no such viewer');
const r1 = (x: number) => Math.round(x * 10) / 10;
const show = (s: Session) => ({
  meanKbps: Math.round(s.meanKbps), stalled: r1(s.stalled), stalls: s.stalls, switches: s.switches,
  segments: s.segments.map((g) => [r1(g.start), r1(g.end), (LADDER[g.rung] as { kbps: number }).kbps]),
  buffer: s.buffer.map(([t, b]) => [r1(t), r1(b)]),
});
const abr = {
  viewer: VIEWER, kind: viewer.trace.kind,
  bandwidth: viewer.trace.kbps.slice(0, 660).map((x) => Math.round(x)),
  throughput: show(play(new ThroughputBased(), viewer.trace, viewer.sizes)),
  buffer: show(play(new BufferBased(), viewer.trace, viewer.sizes)),
};
const cdn = simulateCdn(CDN, [0.5, 1, 2, 5, 10, 20]);
console.log(JSON.stringify({ abr, cdn: { config: CDN, catalogBytes: cdn.catalogBytes, requests: cdn.requests, rows: cdn.rows } }));
