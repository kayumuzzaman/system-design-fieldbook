import type { Graph } from "./graph.ts";
import { NodeHeap } from "./heap.ts";

// A two-level overlay, the idea behind customizable route planning. The map is cut into cells.
// For each cell, the fastest way across it between every pair of its boundary nodes is precomputed
// ("customization"). A query searches the cells of its two ends in full and crosses every other cell
// by those precomputed hops. When traffic changes a road, only that road's cell is customized again.
export class Overlay {
  readonly cell: Int32Array;           // the cell of each node
  readonly boundary: number[][];       // boundary nodes of each cell
  private readonly slot: Int32Array;   // position of a boundary node in its cell's list, or -1
  private readonly clique: Float64Array[]; // per cell: |B| x |B| fastest times across the cell
  private readonly g: Graph;

  constructor(g: Graph, cellSize: number) {
    this.g = g;
    const rows = g.n / g.cols, across = Math.ceil(g.cols / cellSize);
    const cells = across * Math.ceil(rows / cellSize);
    this.cell = new Int32Array(g.n);
    for (let v = 0; v < g.n; v += 1) {
      const c = v % g.cols, r = Math.floor(v / g.cols);
      this.cell[v] = Math.floor(r / cellSize) * across + Math.floor(c / cellSize);
    }
    this.boundary = Array.from({ length: cells }, () => [] as number[]);
    this.slot = new Int32Array(g.n).fill(-1);
    for (let v = 0; v < g.n; v += 1) {
      for (let e = g.first[v] as number; e < (g.first[v + 1] as number); e += 1) {
        if (this.cell[g.head[e] as number] !== this.cell[v]) {
          const list = this.boundary[this.cell[v] as number] as number[];
          this.slot[v] = list.length;
          list.push(v);
          break;
        }
      }
    }
    this.clique = this.boundary.map((b) => new Float64Array(b.length * b.length));
  }
  get cells(): number {
    return this.boundary.length;
  }
  shortcuts(): number {
    return this.boundary.reduce((sum, b) => sum + b.length * (b.length - 1), 0);
  }
  customizeAll(): void {
    for (let c = 0; c < this.boundary.length; c += 1) this.customize(c);
  }
  // Fastest times between the boundary nodes of one cell, staying inside the cell.
  customize(c: number): void {
    const g = this.g, nodes = this.boundary[c] as number[], k = nodes.length;
    const table = this.clique[c] as Float64Array;
    const dist = new Map<number, number>();
    const queue = new NodeHeap();
    for (let i = 0; i < k; i += 1) {
      dist.clear(); queue.clear();
      dist.set(nodes[i] as number, 0); queue.push(0, nodes[i] as number);
      while (queue.size > 0) {
        const d = queue.topKey(), u = queue.pop();
        if (d > (dist.get(u) as number)) continue;
        for (let e = g.first[u] as number; e < (g.first[u + 1] as number); e += 1) {
          const v = g.head[e] as number;
          if (this.cell[v] !== c) continue;
          const dv = d + (g.time[e] as number);
          if (dv < (dist.get(v) ?? Infinity)) { dist.set(v, dv); queue.push(dv, v); }
        }
      }
      for (let j = 0; j < k; j += 1) table[i * k + j] = dist.get(nodes[j] as number) ?? Infinity;
    }
  }
  // The query: the source and target cells in full, every other cell by its precomputed hops.
  query(s: number, t: number, record = false): { time: number; settled: number; searched?: number[] } {
    const g = this.g, cs = this.cell[s], ct = this.cell[t];
    const dist = new Map<number, number>();
    const done = new Set<number>();
    const queue = new NodeHeap();
    const searched: number[] = [];
    dist.set(s, 0); queue.push(0, s);
    let settled = 0;
    const relax = (v: number, dv: number) => {
      if (dv < (dist.get(v) ?? Infinity)) { dist.set(v, dv); queue.push(dv, v); }
    };
    while (queue.size > 0) {
      const d = queue.topKey(), u = queue.pop();
      if (done.has(u) || d > (dist.get(u) as number)) continue;
      done.add(u);
      settled += 1;
      if (record) searched.push(u);
      if (u === t) return { time: d, settled, ...(record ? { searched } : {}) };
      const c = this.cell[u] as number;
      const inside = c === cs || c === ct;
      for (let e = g.first[u] as number; e < (g.first[u + 1] as number); e += 1) {
        const v = g.head[e] as number;
        if (inside || this.cell[v] !== c) relax(v, d + (g.time[e] as number)); // roads leaving the cell always count
      }
      if (!inside) {
        const nodes = this.boundary[c] as number[], k = nodes.length, i = this.slot[u] as number;
        const table = this.clique[c] as Float64Array;
        for (let j = 0; j < k; j += 1) if (j !== i) relax(nodes[j] as number, d + (table[i * k + j] as number));
      }
    }
    return { time: Infinity, settled, ...(record ? { searched } : {}) };
  }
}
