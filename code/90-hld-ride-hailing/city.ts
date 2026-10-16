import { DriverGrid, type Point } from "./grid.ts";
import { assign } from "./assign.ts";

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

export const SIDE = 20_000; // the city is 20 km by 20 km
export const SPEED = 25 / 3.6; // 25 km/h through town, in meters a second
export const DETOUR = 1.3; // roads are about 30% longer than the straight line
export const eta = (a: Point, b: Point) => (DETOUR * Math.hypot(a.x - b.x, a.y - b.y)) / SPEED;

// Where riders are: half near five busy districts, half anywhere.
export function spot(r: () => number): Point {
  const hubs = [[6000, 7000], [14000, 6000], [10000, 10000], [5000, 15000], [15000, 14500]] as const;
  if (r() < 0.5) {
    const h = hubs[Math.floor(r() * hubs.length)] as readonly [number, number];
    return { x: Math.min(SIDE, Math.max(0, h[0] + gauss(r) * 1500)), y: Math.min(SIDE, Math.max(0, h[1] + gauss(r) * 1500)) };
  }
  return { x: r() * SIDE, y: r() * SIDE };
}

// ---------------------------------------------------------------- matching
type Rider = { id: number; at: number; from: Point; to: Point };
type Driver = { id: string; freeAt: number; pos: Point };

// Riders arrive at random; every `window` seconds (0: on arrival) waiting riders are matched to
// free drivers. Greedy takes riders in order, each to the nearest free driver. Batched solves one
// assignment that minimizes the total time to pickup over everyone waiting.
export function dispatch(o: { drivers: number; perSecond: number; hours: number; window: number; mode: "greedy" | "batched"; seed: number; candidates?: number }) {
  const r = seeded(o.seed);
  const k = o.candidates ?? 8;
  const grid = new DriverGrid(500);
  const drivers: Driver[] = Array.from({ length: o.drivers }, (_, i) => ({ id: `d${i}`, freeAt: 0, pos: spot(r) }));
  for (const d of drivers) grid.report(d.id, d.pos);
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const busy: Driver[] = [];
  const end = o.hours * 3600, warm = 1800;
  const riders: Rider[] = [];
  for (let t = -Math.log(1 - r()) / o.perSecond, id = 0; t < end; t += -Math.log(1 - r()) / o.perSecond) riders.push({ id: id++, at: t, from: spot(r), to: spot(r) });
  const waiting: Rider[] = [];
  let next = 0, pickupSum = 0, delaySum = 0, served = 0, gaveUp = 0, busySeconds = 0;
  const serve = (rd: Rider, d: Driver, now: number) => {
    const pickup = eta(d.pos, rd.from);
    if (rd.at >= warm) { pickupSum += pickup; delaySum += now - rd.at; served += 1; busySeconds += Math.min(end, now + pickup + eta(rd.from, rd.to)) - now; } // busy time inside the measured period
    grid.remove(d.id);
    d.freeAt = now + pickup + eta(rd.from, rd.to);
    d.pos = rd.to;
    busy.push(d);
  };
  for (let now = 0; now < end; now += o.window > 0 ? o.window : 1) {
    // drivers who finished a trip become free where they dropped off
    for (let i = busy.length - 1; i >= 0; i -= 1) {
      const d = busy[i] as Driver;
      if (d.freeAt <= now) { grid.report(d.id, d.pos); busy.splice(i, 1); }
    }
    while (next < riders.length && (riders[next] as Rider).at <= now) waiting.push(riders[next++] as Rider);
    for (let i = waiting.length - 1; i >= 0; i -= 1) if (now - (waiting[i] as Rider).at > 600) { if ((waiting[i] as Rider).at >= warm) gaveUp += 1; waiting.splice(i, 1); } // gives up after 10 minutes
    if (waiting.length === 0 || grid.size_ === 0) continue;
    if (o.mode === "greedy") {
      for (let i = 0; i < waiting.length && grid.size_ > 0; ) { // oldest first, each to the nearest free driver
        const rd = waiting[i] as Rider;
        const near = grid.nearest(rd.from, k, 5_000).ids.map((id) => byId.get(id) as Driver);
        if (near.length === 0) { i += 1; continue; } // nobody within 5 km yet: keep waiting
        const best = near.reduce((a, b) => (eta(b.pos, rd.from) < eta(a.pos, rd.from) ? b : a));
        serve(rd, best, now);
        waiting.splice(i, 1);
      }
    } else {
      const cols = new Map<string, Driver>();
      const cand = waiting.map((rd) => grid.nearest(rd.from, k, 5_000).ids);
      for (const ids of cand) for (const id of ids) cols.set(id, byId.get(id) as Driver);
      const ds = [...cols.values()];
      const rows = waiting.slice(0, ds.length); // more riders than candidate drivers: match the earliest
      const big = 1e7;
      const cost = rows.map((rd, i) => ds.map((d) => (cand[i]?.includes(d.id) ? eta(d.pos, rd.from) : big)));
      const pick = assign(cost);
      const taken = new Set<number>();
      pick.forEach((j, i) => {
        if (j < 0 || (cost[i] as number[])[j] === big) return;
        serve(rows[i] as Rider, ds[j] as Driver, now);
        taken.add(i);
      });
      for (let i = rows.length - 1; i >= 0; i -= 1) if (taken.has(i)) waiting.splice(i, 1);
    }
  }
  return { served, gaveUp, meanPickup: pickupSum / served, meanMatchDelay: delaySum / served, meanWait: (pickupSum + delaySum) / served, utilization: busySeconds / (o.drivers * (end - warm)) }; // approximate: trips begun before the warm-up are not counted
}

// ---------------------------------------------------------------- location reports
// Drivers drive between random places at SPEED and report every `interval` seconds. What share of
// reports moves a driver into another cell of the grid?
export function reports(o: { drivers: number; minutes: number; interval: number; cells: number[]; seed: number }) {
  const r = seeded(o.seed);
  const grids = o.cells.map((c) => new DriverGrid(c));
  const changed = o.cells.map(() => 0);
  let total = 0;
  const state = Array.from({ length: o.drivers }, () => ({ pos: spot(r), to: spot(r) }));
  for (let t = 0; t < o.minutes * 60; t += o.interval) {
    state.forEach((s, i) => {
      const dx = s.to.x - s.pos.x, dy = s.to.y - s.pos.y, dist = Math.hypot(dx, dy), step = SPEED * o.interval;
      s.pos = dist <= step ? s.to : { x: s.pos.x + (dx / dist) * step, y: s.pos.y + (dy / dist) * step };
      if (dist <= step) s.to = spot(r);
      grids.forEach((g, j) => { if (g.report(`d${i}`, s.pos) && t > 0) changed[j] = (changed[j] as number) + 1; });
      if (t > 0) total += 1;
    });
  }
  return o.cells.map((c, j) => ({ cell: c, share: (changed[j] as number) / total }));
}
