import assert from "node:assert/strict";
import { component, edgeBetween, roadGrid, setTime, type Graph } from "./graph.ts";
import { astar, bidirectional, dijkstra, pathTime } from "./search.ts";
import { contract, chQuery } from "./hierarchy.ts";
import { Overlay } from "./overlay.ts";
import { compareMethods, makeDays } from "./eta.ts";
import { metersPerPixel, quadkey, tileOf, tilesAt, tilesOnScreen, tilesUpTo } from "./tiles.ts";
import { seeded } from "./random.ts";

const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

// --- tiles: the arithmetic of the pyramid
assert.equal(tilesAt(0), 1);
assert.equal(tilesUpTo(2), 21);
assert.ok(Math.abs(metersPerPixel(0, 0) - 156543.03) < 0.01);
assert.deepEqual(tileOf(0.0001, 0.0001, 1), { x: 1, y: 0 });
assert.deepEqual(tileOf(-179.9, -84.9, 2), { x: 0, y: 3 });
assert.equal(quadkey(3, 5, 3), "213");                    // the example in Microsoft's Bing Maps tile documentation
assert.ok(quadkey(6, 10, 4).startsWith(quadkey(3, 5, 3))); // a child's quadkey starts with its parent's
console.log(`tiles at zoom 14: ${fmt(tilesAt(14))}; zoom 0 to 14: ${fmt(tilesUpTo(14))}; zoom 18 alone: ${fmt(tilesAt(18))}`);
console.log(`meters per pixel at the equator, zoom 18: ${metersPerPixel(0, 18).toFixed(2)}; at 60 degrees: ${metersPerPixel(60, 18).toFixed(2)}`);
console.log(`a 412 x 915 phone screen overlaps at most ${tilesOnScreen(412, 915)} tiles of 256 pixels, ${tilesOnScreen(412, 915, 512)} of 512`);

// --- the road grid
const g = roadGrid(128, 128, 7);
const main = component(g, Math.floor(g.n / 2));
const nodes: number[] = [];
for (let v = 0; v < g.n; v += 1) if (main[v]) nodes.push(v);
console.log(`road grid: ${fmt(g.n)} intersections, ${fmt(g.head.length / 2)} road segments, ${fmt(nodes.length)} connected`);

function queries(count: number, seed: number): [number, number][] {
  const random = seeded(seed);
  const pick = () => nodes[Math.floor(random() * nodes.length)] as number;
  return Array.from({ length: count }, () => [pick(), pick()]);
}

// --- every algorithm finds the same fastest time
const h = contract(g);
const overlay = new Overlay(g, 16);
overlay.customizeAll();
console.log(`contraction hierarchy: ${fmt(h.shortcuts)} shortcuts added to ${fmt(g.head.length / 2)} segments`);
console.log(`overlay: ${overlay.cells} cells, ${fmt(overlay.shortcuts())} precomputed hops`);
const work: Record<string, number[]> = { dijkstra: [], "A*": [], bidirectional: [], overlay: [], hierarchy: [] };
for (const [s, t] of queries(300, 3)) {
  const d = dijkstra(g, s, t), a = astar(g, s, t), b = bidirectional(g, s, t), c = chQuery(h, s, t), o = overlay.query(s, t);
  assert.equal(a.time, d.time); assert.equal(b.time, d.time); assert.equal(c.time, d.time); assert.equal(o.time, d.time);
  assert.equal(pathTime(g, d.path), d.time);
  assert.equal(pathTime(g, c.path), d.time);       // the shortcuts unpack into real roads with the same time
  assert.equal(pathTime(g, b.path), d.time);
  work.dijkstra?.push(d.settled); work["A*"]?.push(a.settled); work.bidirectional?.push(b.settled);
  work.overlay?.push(o.settled); work.hierarchy?.push(c.settled);
}
const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
const base = mean(work.dijkstra as number[]);
for (const [name, xs] of Object.entries(work))
  console.log(`  ${name.padEnd(14)} settles ${fmt(Math.round(mean(xs))).padStart(6)} nodes on average (${((mean(xs) / base) * 100).toFixed(1)}% of Dijkstra)`);
console.log("all five agree on the fastest time for 300 of 300 random trips");

// --- a jam on a highway: the overlay updates one cell; a hierarchy built before the jam is now wrong
function jam(graph: Graph, row: number, fromCol: number, toCol: number, factor: number): number[] {
  const changed: number[] = [];
  for (let c = fromCol; c < toCol; c += 1) {
    const e = edgeBetween(graph, row * graph.cols + c, row * graph.cols + c + 1);
    if (e >= 0) { setTime(graph, e, (graph.time[e] as number) * factor); changed.push(row * graph.cols + c); }
  }
  return changed;
}
{
  const changed = jam(g, 48, 34, 46, 6);                       // 3 km of the highway on row 48, six times slower
  const cells = new Set(changed.map((v) => overlay.cell[v] as number));
  for (const c of cells) overlay.customize(c);
  let stale = 0, crossing = 0;
  const random = seeded(5);
  for (let i = 0; i < 100; i += 1) {
    // trips from the west to the east of the jam, near the highway
    const s = (40 + Math.floor(random() * 16)) * g.cols + Math.floor(random() * 20);
    const t = (40 + Math.floor(random() * 16)) * g.cols + 60 + Math.floor(random() * 20);
    if (!main[s] || !main[t]) continue;
    crossing += 1;
    const truth = dijkstra(g, s, t).time;
    assert.equal(overlay.query(s, t).time, truth);
    if (chQuery(h, s, t).time !== truth) stale += 1;
  }
  console.log(`jam: ${changed.length} segments in ${cells.size} cell(s) re-customized; overlay correct on ${crossing} of ${crossing} trips past it`);
  console.log(`the hierarchy built before the jam gave a wrong time on ${stale} of ${crossing}`);
  assert.ok(stale > 0);
  const fresh = contract(g);
  for (const [s, t] of queries(50, 9)) assert.equal(chQuery(fresh, s, t).time, dijkstra(g, s, t).time);
  console.log("rebuilt from scratch, the hierarchy is right again (50 of 50)");
}

// --- travel-time estimates over 300 simulated mornings
const rows = compareMethods(makeDays(300, 11), 12);
console.log("travel-time error, 300 mornings, departures every 10 minutes from 06:00 to 10:00:");
for (const r of rows) console.log(`  ${r.method.padEnd(24)} mean ${r.meanPct}%, 90th percentile ${r.p90Pct}%, with a crash on the way ${r.incidentMeanPct}%`);
const by = Object.fromEntries(rows.map((r) => [r.method, r.meanPct]));
assert.ok((by["now, fading to typical"] as number) < (by["typical for the time"] as number));
assert.ok((by["typical for the time"] as number) < (by["traffic now"] as number));
assert.ok((by["traffic now"] as number) < (by["free flow"] as number));
console.log("ok");
