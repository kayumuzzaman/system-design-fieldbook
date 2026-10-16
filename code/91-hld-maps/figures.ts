// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`.
// The search spaces and errors are the same on every run; the timings are not.
import { component, roadGrid, type Graph } from "./graph.ts";
import { astar, bidirectional, dijkstra } from "./search.ts";
import { contract, chQuery } from "./hierarchy.ts";
import { Overlay } from "./overlay.ts";
import { actualKmh, compareMethods, drive, makeDays, predict, ROUTE } from "./eta.ts";
import { seeded } from "./random.ts";

const ms = (f: () => void, times = 1) => { const t0 = performance.now(); for (let i = 0; i < times; i += 1) f(); return (performance.now() - t0) / times; };
const r1 = (x: number) => Math.round(x * 10) / 10;

function setup(size: number) {
  const g = roadGrid(size, size, 7);
  const main = component(g, Math.floor(g.n / 2));
  const nodes: number[] = [];
  for (let v = 0; v < g.n; v += 1) if (main[v]) nodes.push(v);
  return { g, nodes };
}
function pairs(nodes: number[], count: number, seed: number): [number, number][] {
  const random = seeded(seed), pick = () => nodes[Math.floor(random() * nodes.length)] as number;
  return Array.from({ length: count }, () => [pick(), pick()]);
}
const km = (g: Graph, s: number, t: number) => Math.hypot((g.x[s] as number) - (g.x[t] as number), (g.y[s] as number) - (g.y[t] as number)) / 1000;

// 1. One trip across town, and the nodes each method settles to find it.
const { g, nodes } = setup(128);
const ch = contract(g);
const overlay = new Overlay(g, 16);
overlay.customizeAll();
const s = 20 * 128 + 14, t = 100 * 128 + 110;
const d = dijkstra(g, s, t, true), a = astar(g, s, t, true), b = bidirectional(g, s, t, true);
const c = chQuery(ch, s, t, true), o = overlay.query(s, t, true);
const search = {
  cols: 128, s, t, km: r1(km(g, s, t)), minutes: r1((d.time as number) / 600), path: d.path,
  methods: [
    { name: "Dijkstra", settled: d.settled, nodes: d.searched },
    { name: "A*", settled: a.settled, nodes: a.searched },
    { name: "Bidirectional", settled: b.settled, nodes: b.searched },
    { name: "Overlay", settled: o.settled, nodes: o.searched },
    { name: "Contraction hierarchy", settled: c.settled, nodes: c.searched },
  ],
  cellSize: 16,
};

// 2. Work by trip length, over 600 random trips.
const bands = [[0, 5], [5, 10], [10, 20], [20, 50]];
const sums = bands.map(() => ({ trips: 0, dijkstra: 0, astar: 0, bidirectional: 0, overlay: 0, hierarchy: 0 }));
for (const [x, y] of pairs(nodes, 600, 21)) {
  const k = km(g, x, y), i = bands.findIndex(([lo, hi]) => k >= (lo as number) && k < (hi as number));
  const row = sums[i] as (typeof sums)[number];
  row.trips += 1;
  row.dijkstra += dijkstra(g, x, y).settled; row.astar += astar(g, x, y).settled;
  row.bidirectional += bidirectional(g, x, y).settled; row.overlay += overlay.query(x, y).settled;
  row.hierarchy += chQuery(ch, x, y).settled;
}
const byLength = sums.map((row, i) => ({
  band: bands[i], trips: row.trips,
  dijkstra: Math.round(row.dijkstra / row.trips), astar: Math.round(row.astar / row.trips),
  bidirectional: Math.round(row.bidirectional / row.trips), overlay: Math.round(row.overlay / row.trips),
  hierarchy: Math.round(row.hierarchy / row.trips),
}));

// 3. Bigger cities: how the work and the preparation grow (timings: one run).
const scaling = [64, 128, 192, 256].map((size) => {
  const { g: gg, nodes: nn } = setup(size);
  let h = contract(gg);
  const build = ms(() => { h = contract(gg); });
  const ov = new Overlay(gg, 16);
  const all = ms(() => ov.customizeAll());
  const one = ms(() => ov.customize(Math.floor(ov.cells / 2)), 20);
  const qs = pairs(nn, 100, 4);
  let dj = 0, hc = 0, ovs = 0;
  const tD = ms(() => { for (const [x, y] of qs) dj += dijkstra(gg, x, y).settled; }) / qs.length;
  const tH = ms(() => { for (const [x, y] of qs) hc += chQuery(h, x, y).settled; }) / qs.length;
  const tO = ms(() => { for (const [x, y] of qs) ovs += ov.query(x, y).settled; }) / qs.length;
  return {
    nodes: gg.n, segments: gg.head.length / 2, shortcuts: h.shortcuts,
    dijkstraSettled: Math.round(dj / qs.length), hierarchySettled: Math.round(hc / qs.length), overlaySettled: Math.round(ovs / qs.length),
    dijkstraMs: r1(tD * 100) / 100, hierarchyMs: r1(tH * 100) / 100, overlayMs: r1(tO * 100) / 100,
    contractMs: Math.round(build), customizeAllMs: Math.round(all), customizeOneMs: r1(one * 10) / 10,
  };
});

// 4. One morning with a crash: travel time by departure, as driven and as predicted at departure.
const days = makeDays(300, 11);
const index = days.findIndex((day) => day.incident !== null && day.incident.start > 455 && day.incident.start < 480 && day.severity > 1);
const day = days[index] as (typeof days)[number];
const random = seeded(99);
const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const morning = [];
for (let t0 = 360; t0 <= 600; t0 += 5) {
  const live = ROUTE.map((_, k) => actualKmh(k, t0, day) * (1 + 0.05 * gauss()));
  morning.push({
    t0, actual: r1(drive(t0, (k, tt) => actualKmh(k, tt, day))),
    now: r1(predict("traffic now", t0, live)), typical: r1(predict("typical for the time", t0, live)),
    fading: r1(predict("now, fading to typical", t0, live)), free: r1(predict("free flow", t0, live)),
  });
}
console.log(JSON.stringify({ search, byLength, scaling, morning: { day: index, incident: day.incident, severity: r1(day.severity * 100) / 100, points: morning }, errors: compareMethods(days, 12) }));
