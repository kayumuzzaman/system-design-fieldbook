import type { Graph } from "./graph.ts";
import { NodeHeap } from "./heap.ts";

// Contraction hierarchies. Preprocessing removes ("contracts") nodes one at a time, least important
// first. When a node is removed, any shortest path that went through it is kept as a shortcut edge
// between its neighbors. A query then searches only upward, toward more important nodes, from both ends.
export interface Hierarchy {
  readonly rank: Int32Array;     // order of contraction: higher is more important
  readonly first: Int32Array;    // upward edges of v: first[v] .. first[v + 1] - 1
  readonly head: Int32Array;
  readonly time: Int32Array;
  readonly mid: Int32Array;      // for a shortcut, the node it skips; -1 for a real road
  readonly shortcuts: number;
}

export function contract(g: Graph, witnessLimit = 60): Hierarchy {
  const n = g.n;
  // A working copy of the graph as adjacency lists, which shrinks as nodes are contracted.
  const nbr: number[][] = [], wt: number[][] = [], via: number[][] = [];
  for (let v = 0; v < n; v += 1) {
    nbr.push([]); wt.push([]); via.push([]);
    for (let e = g.first[v] as number; e < (g.first[v + 1] as number); e += 1) {
      addOrLower(v, g.head[e] as number, g.time[e] as number, -1);
    }
  }
  function addOrLower(a: number, b: number, w: number, m: number): void {
    const list = nbr[a] as number[], i = list.indexOf(b);
    if (i < 0) { list.push(b); (wt[a] as number[]).push(w); (via[a] as number[]).push(m); }
    else if (w < ((wt[a] as number[])[i] as number)) { (wt[a] as number[])[i] = w; (via[a] as number[])[i] = m; }
  }
  const contracted = new Uint8Array(n);
  const deletedNeighbors = new Int32Array(n);

  // Witness search: the shortest distance from u to each target that avoids v, looking only a little way.
  const dist = new Float64Array(n).fill(Infinity);
  const touched: number[] = [];
  const queue = new NodeHeap();
  function witness(u: number, skip: number, limit: number): void {
    for (const t of touched) dist[t] = Infinity;
    touched.length = 0;
    queue.clear();
    dist[u] = 0; touched.push(u); queue.push(0, u);
    let settled = 0;
    while (queue.size > 0 && settled < witnessLimit) {
      const d = queue.topKey(), x = queue.pop();
      if (d > (dist[x] as number)) continue;
      if (d > limit) break;
      settled += 1;
      const xs = nbr[x] as number[], ws = wt[x] as number[];
      for (let i = 0; i < xs.length; i += 1) {
        const y = xs[i] as number;
        if (y === skip || contracted[y]) continue;
        const dy = d + (ws[i] as number);
        if (dy < (dist[y] as number)) { if (dist[y] === Infinity) touched.push(y); dist[y] = dy; queue.push(dy, y); }
      }
    }
  }
  // The shortcuts that removing v would need: (u, w, length) for each pair with no witness path.
  function needed(v: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    const vs = nbr[v] as number[], ws = wt[v] as number[];
    const live: number[] = [], cost: number[] = [];
    for (let i = 0; i < vs.length; i += 1) if (!contracted[vs[i] as number]) { live.push(vs[i] as number); cost.push(ws[i] as number); }
    for (let i = 0; i < live.length; i += 1) {
      let limit = 0;
      for (let j = i + 1; j < live.length; j += 1) limit = Math.max(limit, (cost[i] as number) + (cost[j] as number));
      if (limit === 0) continue;
      witness(live[i] as number, v, limit);
      for (let j = i + 1; j < live.length; j += 1) {
        const through = (cost[i] as number) + (cost[j] as number);
        if ((dist[live[j] as number] as number) > through) out.push([live[i] as number, live[j] as number, through]);
      }
    }
    return out;
  }
  function liveDegree(v: number): number {
    let k = 0;
    for (const u of nbr[v] as number[]) if (!contracted[u]) k += 1;
    return k;
  }
  // Importance: shortcuts added minus edges removed, plus neighbors already contracted (to spread work out).
  const priority = (v: number) => needed(v).length - liveDegree(v) + (deletedNeighbors[v] as number);

  const order = new NodeHeap(n);
  for (let v = 0; v < n; v += 1) order.push(priority(v), v);
  const rank = new Int32Array(n);
  const upFrom: number[] = [], upTo: number[] = [], upTime: number[] = [], upMid: number[] = [];
  let shortcuts = 0, next = 0;
  while (order.size > 0) {
    const v = order.pop();
    if (contracted[v]) continue;
    const p = priority(v);                       // lazy update: priorities go stale as neighbors go
    if (order.size > 0 && p > order.topKey()) { order.push(p, v); continue; }
    for (const [a, b, w] of needed(v)) {
      addOrLower(a, b, w, v); addOrLower(b, a, w, v);
      shortcuts += 1;
    }
    const vs = nbr[v] as number[], ws = wt[v] as number[], ms = via[v] as number[];
    for (let i = 0; i < vs.length; i += 1) {
      const u = vs[i] as number;
      if (contracted[u]) continue;
      upFrom.push(v); upTo.push(u); upTime.push(ws[i] as number); upMid.push(ms[i] as number);
      deletedNeighbors[u] += 1;
    }
    contracted[v] = 1;
    rank[v] = next++;
  }
  // Pack the upward edges into arrays, grouped by their lower end.
  const first = new Int32Array(n + 1);
  for (const a of upFrom) first[a + 1] += 1;
  for (let v = 0; v < n; v += 1) first[v + 1] = (first[v + 1] as number) + (first[v] as number);
  const fill = first.slice(0, n), m = upFrom.length;
  const head = new Int32Array(m), time = new Int32Array(m), mid = new Int32Array(m);
  for (let i = 0; i < m; i += 1) {
    const a = upFrom[i] as number, k = fill[a] as number;
    fill[a] = k + 1;
    head[k] = upTo[i] as number; time[k] = upTime[i] as number; mid[k] = upMid[i] as number;
  }
  return { rank, first, head, time, mid, shortcuts };
}

// The query: upward Dijkstra from both ends. They meet at the most important node of the route.
export function chQuery(h: Hierarchy, s: number, t: number, record = false):
  { time: number; settled: number; path: number[]; searched?: number[] } {
  const n = h.rank.length;
  const dist = [new Map<number, number>(), new Map<number, number>()];
  const parent = [new Map<number, number>(), new Map<number, number>()];
  const done = [new Set<number>(), new Set<number>()];
  const queue = [new NodeHeap(), new NodeHeap()];
  const searched: number[] = [];
  (dist[0] as Map<number, number>).set(s, 0); (dist[1] as Map<number, number>).set(t, 0);
  (queue[0] as NodeHeap).push(0, s); (queue[1] as NodeHeap).push(0, t);
  let best = Infinity, meet = -1, settled = 0;
  for (;;) {
    const q0 = queue[0] as NodeHeap, q1 = queue[1] as NodeHeap;
    // Each side may stop once its next node is already farther than the best route found.
    const go0 = q0.topKey() < best, go1 = q1.topKey() < best;
    if (!go0 && !go1) break;
    const side = go0 && (!go1 || q0.topKey() <= q1.topKey()) ? 0 : 1;
    const q = queue[side] as NodeHeap, d = dist[side] as Map<number, number>;
    const key = q.topKey(), u = q.pop();
    if ((done[side] as Set<number>).has(u) || key > (d.get(u) as number)) continue;
    (done[side] as Set<number>).add(u);
    settled += 1;
    if (record) searched.push(u);
    const other = (dist[1 - side] as Map<number, number>).get(u);
    if (other !== undefined && key + other < best) { best = key + other; meet = u; }
    for (let e = h.first[u] as number; e < (h.first[u + 1] as number); e += 1) {
      const v = h.head[e] as number, dv = key + (h.time[e] as number);
      if (dv < (d.get(v) ?? Infinity)) { d.set(v, dv); (parent[side] as Map<number, number>).set(v, u); q.push(dv, v); }
    }
  }
  if (meet < 0 || n === 0) return { time: Infinity, settled, path: [] };
  const climb = (side: number) => {
    const p: number[] = [];
    for (let v: number | undefined = meet; v !== undefined; v = (parent[side] as Map<number, number>).get(v)) p.push(v);
    return p;
  };
  const up = climb(0).reverse(), down = climb(1);
  const path = [up[0] as number];
  const nodes = [...up, ...down.slice(1)];
  for (let i = 0; i + 1 < nodes.length; i += 1) unpack(h, nodes[i] as number, nodes[i + 1] as number, path);
  return { time: best, settled, path, ...(record ? { searched } : {}) };
}

// Replaces a shortcut by the two edges it stands for, recursively, to recover the roads driven.
function unpack(h: Hierarchy, a: number, b: number, out: number[]): void {
  const [lo, hi] = (h.rank[a] as number) < (h.rank[b] as number) ? [a, b] : [b, a];
  let edge = -1;
  for (let e = h.first[lo] as number; e < (h.first[lo + 1] as number); e += 1)
    if (h.head[e] === hi && (edge < 0 || (h.time[e] as number) < (h.time[edge] as number))) edge = e;
  const m = h.mid[edge] as number;
  if (m < 0) { out.push(b); return; }
  unpack(h, a, m, out);
  unpack(h, m, b, out);
}
