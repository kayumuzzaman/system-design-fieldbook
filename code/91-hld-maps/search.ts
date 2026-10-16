import type { Graph } from "./graph.ts";
import { SPEED_KMH } from "./graph.ts";
import { NodeHeap } from "./heap.ts";

export interface Route {
  time: number;        // tenths of a second, Infinity if there is no route
  settled: number;     // nodes taken off the queue: the work done
  path: number[];      // nodes from source to target
  searched?: number[]; // the settled nodes, in order, when asked for
}

function pathTo(parent: Int32Array, t: number): number[] {
  const path: number[] = [];
  for (let v = t; v !== -1; v = parent[v] as number) path.push(v);
  return path.reverse();
}

// Dijkstra's algorithm from s, stopping when t is settled. With a heuristic it is A*.
export function dijkstra(g: Graph, s: number, t: number, record = false,
  heuristic: (v: number) => number = () => 0): Route {
  const dist = new Float64Array(g.n).fill(Infinity);
  const parent = new Int32Array(g.n).fill(-1);
  const done = new Uint8Array(g.n);
  const queue = new NodeHeap();
  const searched: number[] = [];
  dist[s] = 0;
  queue.push(heuristic(s), s);
  let settled = 0;
  while (queue.size > 0) {
    const u = queue.pop();
    if (done[u]) continue;            // a stale copy, pushed before a shorter distance was found
    done[u] = 1;
    settled += 1;
    if (record) searched.push(u);
    if (u === t) break;
    const du = dist[u] as number;
    for (let e = g.first[u] as number; e < (g.first[u + 1] as number); e += 1) {
      const v = g.head[e] as number, d = du + (g.time[e] as number);
      if (d < (dist[v] as number)) {
        dist[v] = d;
        parent[v] = u;
        queue.push(d + heuristic(v), v);
      }
    }
  }
  const time = dist[t] as number;
  return { time, settled, path: time < Infinity ? pathTo(parent, t) : [], ...(record ? { searched } : {}) };
}

// A*: the heuristic is the straight-line distance to t at the top speed of any road. It never
// overestimates, so the answer is still exact, but it must assume a highway all the way.
export function astar(g: Graph, s: number, t: number, record = false): Route {
  const top = SPEED_KMH.highway / 3.6;
  const tx = g.x[t] as number, ty = g.y[t] as number;
  return dijkstra(g, s, t, record, (v) => (Math.hypot((g.x[v] as number) - tx, (g.y[v] as number) - ty) / top) * 10);
}

// Two Dijkstra searches, one from each end, that stop when they can no longer improve on the best
// meeting point found. Roads are two-way here, so the backward search uses the same edges.
export function bidirectional(g: Graph, s: number, t: number, record = false): Route {
  const dist = [new Float64Array(g.n).fill(Infinity), new Float64Array(g.n).fill(Infinity)];
  const parent = [new Int32Array(g.n).fill(-1), new Int32Array(g.n).fill(-1)];
  const done = [new Uint8Array(g.n), new Uint8Array(g.n)];
  const queue = [new NodeHeap(), new NodeHeap()];
  const searched: number[] = [];
  (dist[0] as Float64Array)[s] = 0; (dist[1] as Float64Array)[t] = 0;
  (queue[0] as NodeHeap).push(0, s); (queue[1] as NodeHeap).push(0, t);
  let best = Infinity, meet = -1, settled = 0;
  while ((queue[0] as NodeHeap).size + (queue[1] as NodeHeap).size > 0) {
    const q0 = queue[0] as NodeHeap, q1 = queue[1] as NodeHeap;
    if (q0.topKey() + q1.topKey() >= best) break;   // no path through unsettled nodes can be shorter
    const side = q0.topKey() <= q1.topKey() ? 0 : 1;
    const q = queue[side] as NodeHeap, d = dist[side] as Float64Array, other = dist[1 - side] as Float64Array;
    const u = q.pop();
    if ((done[side] as Uint8Array)[u]) continue;
    (done[side] as Uint8Array)[u] = 1;
    settled += 1;
    if (record) searched.push(u);
    for (let e = g.first[u] as number; e < (g.first[u + 1] as number); e += 1) {
      const v = g.head[e] as number, dv = (d[u] as number) + (g.time[e] as number);
      if (dv < (d[v] as number)) {
        d[v] = dv;
        (parent[side] as Int32Array)[v] = u;
        q.push(dv, v);
      }
      if (dv + (other[v] as number) < best) { best = dv + (other[v] as number); meet = v; }
    }
  }
  if (meet < 0) return { time: Infinity, settled, path: [] };
  const front = pathTo(parent[0] as Int32Array, meet);
  const back = pathTo(parent[1] as Int32Array, meet).reverse().slice(1);
  return { time: best, settled, path: [...front, ...back], ...(record ? { searched } : {}) };
}

export function pathTime(g: Graph, path: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    let best = Infinity;
    const a = path[i] as number, b = path[i + 1] as number;
    for (let e = g.first[a] as number; e < (g.first[a + 1] as number); e += 1)
      if (g.head[e] === b) best = Math.min(best, g.time[e] as number);
    total += best;
  }
  return total;
}
