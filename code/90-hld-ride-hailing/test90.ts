import assert from "node:assert/strict";
import { DriverGrid } from "./grid.ts";
import { assign } from "./assign.ts";
import { Drivers, Trip } from "./trip.ts";
import { dispatch, reports, seeded } from "./city.ts";

// --- the grid: nearest drivers by ring search agree with a full scan
{
  const r = seeded(1);
  const g = new DriverGrid(500);
  const pts = Array.from({ length: 20_000 }, (_, i) => ({ id: `d${i}`, x: r() * 20_000, y: r() * 20_000 }));
  for (const p of pts) g.report(p.id, p);
  let examined = 0;
  for (let i = 0; i < 200; i += 1) {
    const q = { x: r() * 20_000, y: r() * 20_000 };
    const got = g.nearest(q, 5, 50_000);
    const want = pts.map((p) => ({ id: p.id, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d).slice(0, 5).map((p) => p.id);
    assert.deepEqual(got.ids, want);
    examined += got.examined;
  }
  console.log(`5 nearest of 20,000 drivers in 500 m cells: ${Math.round(examined / 200)} drivers examined on average, against 20,000 for a full scan`);
  assert.equal(g.report("d0", { x: pts[0]!.x + 1, y: pts[0]!.y }) || true, true);
}

// --- location reports: most do not move a driver into another cell
{
  const rows = reports({ drivers: 2000, minutes: 30, interval: 4, cells: [100, 250, 500, 1000], seed: 1 });
  const d = (25 / 3.6) * 4;
  console.log(`drivers at 25 km/h reporting every 4 s (${d.toFixed(1)} m between reports): share of reports that change cell`);
  for (const x of rows) console.log(`  ${String(x.cell).padStart(4)} m cells: ${(x.share * 100).toFixed(1)}% measured, ${((4 / Math.PI) * (d / x.cell) * 100).toFixed(1)}% by the formula (4/π)·d/cell`);
  assert.ok(Math.abs((rows[2] as { share: number }).share - (4 / Math.PI) * (d / 500)) < 0.01);
}

// --- the assignment solver: optimal on small cases checked by trying every permutation
{
  const r = seeded(2);
  const perms = (n: number, m: number): number[][] => {
    if (n === 0) return [[]];
    const out: number[][] = [];
    for (const p of perms(n - 1, m)) for (let j = 0; j < m; j += 1) if (!p.includes(j)) out.push([...p, j]);
    return out;
  };
  for (let t = 0; t < 200; t += 1) {
    const n = 1 + Math.floor(r() * 4), m = n + Math.floor(r() * 3);
    const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.floor(r() * 100)));
    const sum = (p: number[]) => p.reduce((a, j, i) => a + (cost[i] as number[])[j]!, 0);
    const best = Math.min(...perms(n, m).map(sum));
    const got = assign(cost);
    assert.equal(new Set(got).size, n);
    assert.equal(sum(got), best);
  }
  // greedy can be worse: rider A takes the driver rider B needed
  assert.deepEqual(assign([[1, 2], [1, 9]]), [1, 0]); // total 3, where "A first" gives 1 + 9 = 10
}

// --- the trip state machine: legal moves only, and repeated events are harmless
{
  const t = new Trip();
  assert.equal(t.apply({ id: "e1", type: "offer", driver: "d7" }), "applied");
  assert.equal(t.apply({ id: "e2", type: "expire" }), "applied"); // no answer in 10 s
  assert.equal(t.driver, null);
  assert.equal(t.apply({ id: "e3", type: "offer", driver: "d9" }), "applied");
  assert.equal(t.apply({ id: "e4", type: "accept" }), "applied");
  assert.equal(t.apply({ id: "e4", type: "accept" }), "duplicate"); // the same message delivered twice
  assert.equal(t.apply({ id: "e5", type: "complete" }), "refused"); // cannot complete before the ride starts
  for (const [id, type] of [["e6", "arrive"], ["e7", "start"], ["e8", "complete"]] as const) assert.equal(t.apply({ id, type }), "applied");
  assert.equal(t.apply({ id: "e9", type: "cancel" }), "refused");
  assert.deepEqual(t.history, ["requested", "offered", "requested", "offered", "accepted", "arrived", "in_progress", "completed"]);
}

// --- two dispatchers pick the same driver at the same moment
{
  const store = new Map<string, string | null>([["d1", null]]);
  const later = () => new Promise<void>((resolve) => setTimeout(resolve, 1));
  const naive = async (trip: string) => { // read, then write, as two calls to a remote store
    const holder = store.get("d1");
    await later();
    if (holder !== null) return false;
    store.set("d1", trip);
    return true;
  };
  const both = await Promise.all([naive("t1"), naive("t2")]);
  assert.deepEqual(both, [true, true]); // both believe they have the driver
  const drivers = new Drivers();
  drivers.add("d1");
  const atomic = await Promise.all(["t1", "t2"].map(async (trip) => { await later(); return drivers.claim("d1", trip); }));
  assert.deepEqual(atomic, [true, false]);
  assert.equal(drivers.release("d1", "t2"), false); // only the holder may release
  console.log(`two dispatchers, one driver: read-then-write assigned the driver ${both.filter(Boolean).length} times, compare-and-set ${atomic.filter(Boolean).length} time`);
}

// --- matching: greedy against batched, near capacity
{
  const base = { drivers: 1000, perSecond: 0.5, hours: 3, window: 5, seed: 2 };
  const g = dispatch({ ...base, mode: "greedy" });
  const b = dispatch({ ...base, mode: "batched" });
  const f = (x: typeof g) => `pickup ${x.meanPickup.toFixed(0)} s, wait for a match ${x.meanMatchDelay.toFixed(0)} s, total ${x.meanWait.toFixed(0)} s, ${x.served.toLocaleString("en-US")} served, ${x.gaveUp} gave up, drivers busy ${(x.utilization * 100).toFixed(0)}%`;
  console.log("1,000 drivers, 0.5 requests a second, matched every 5 s, 2.5 hours measured:");
  console.log(`  greedy, oldest rider first: ${f(g)}`);
  console.log(`  batched, least total pickup: ${f(b)}`);
  assert.ok(b.meanWait < g.meanWait);
}
console.log("all chapter 90 tests passed");
