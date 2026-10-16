// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json` (about a minute)
import { DriverGrid } from "./grid.ts";
import { dispatch, seeded, spot } from "./city.ts";

// fig-grid: free drivers around a request, 500 m cells, the rings searched for the 5 nearest
const r = seeded(6);
const g = new DriverGrid(500);
const drivers = Array.from({ length: 1000 }, (_, i) => ({ id: `d${i}`, ...spot(r) }));
for (const d of drivers) g.report(d.id, d);
const request = { x: 10_230, y: 10_180 };
const near = g.nearest(request, 5);
const windowM = 1500;
const shown = drivers.filter((d) => Math.abs(d.x - request.x) <= windowM && Math.abs(d.y - request.y) <= windowM);
const rings = Math.max(...near.ids.map((id) => { const d = drivers.find((x) => x.id === id) as { x: number; y: number }; return Math.max(Math.abs(Math.floor(d.x / 500) - Math.floor(request.x / 500)), Math.abs(Math.floor(d.y / 500) - Math.floor(request.y / 500))); }));
const grid = { request, nearest: near.ids, examined: near.examined, cells: near.cells, ringsWithFinds: rings, drivers: shown };

// fig-batching: mean wait by demand, greedy every second against batched every 5 seconds
const demand = [0.3, 0.4, 0.45, 0.48, 0.5, 0.52].map((perSecond) => {
  const gr = dispatch({ drivers: 1000, perSecond, hours: 3, window: 1, mode: "greedy", seed: 2 });
  const ba = dispatch({ drivers: 1000, perSecond, hours: 3, window: 5, mode: "batched", seed: 2 });
  const round = (x: typeof gr) => ({ pickup: Math.round(x.meanPickup), delay: Math.round(x.meanMatchDelay), wait: Math.round(x.meanWait), served: x.served, gaveUp: x.gaveUp, busy: Math.round(x.utilization * 100) });
  return { perSecond, greedy: round(gr), batched: round(ba) };
});
console.log(JSON.stringify({ grid, demand }));
