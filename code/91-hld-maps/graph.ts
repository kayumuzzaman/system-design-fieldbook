import { seeded } from "./random.ts";

// A road network as a graph: intersections are nodes, road segments are edges in both directions.
// Travel times are whole tenths of a second, so every algorithm's answer can be compared exactly.
export type RoadClass = "local" | "arterial" | "highway";
export const SPEED_KMH: Record<RoadClass, number> = { local: 30, arterial: 50, highway: 100 };
export const CLASSES: RoadClass[] = ["local", "arterial", "highway"];

export interface Graph {
  readonly n: number;
  readonly cols: number;
  readonly x: Float64Array;     // meters east of the corner
  readonly y: Float64Array;     // meters north of the corner
  readonly first: Int32Array;   // edges of node v are first[v] .. first[v + 1] - 1
  readonly head: Int32Array;    // where each edge leads
  readonly time: Int32Array;    // travel time of each edge, tenths of a second (can change: traffic)
  readonly length: Float64Array; // meters
  readonly road: Uint8Array;    // index into CLASSES
  readonly twin: Int32Array;    // the same segment in the other direction
}

// Seconds × 10, rounded up, so that no edge is faster than its length at the top speed.
export function tenths(meters: number, kmh: number): number {
  return Math.ceil((meters / (kmh / 3.6)) * 10);
}

export function fromSegments(n: number, cols: number, x: Float64Array, y: Float64Array,
  segments: { a: number; b: number; road: number }[]): Graph {
  const degree = new Int32Array(n + 1);
  for (const s of segments) { degree[s.a + 1] += 1; degree[s.b + 1] += 1; }
  const first = new Int32Array(n + 1);
  for (let v = 0; v < n; v += 1) first[v + 1] = (first[v] as number) + (degree[v + 1] as number);
  const m = first[n] as number;
  const head = new Int32Array(m), time = new Int32Array(m), length = new Float64Array(m);
  const road = new Uint8Array(m), twin = new Int32Array(m), fill = first.slice(0, n);
  for (const s of segments) {
    const meters = Math.hypot((x[s.a] as number) - (x[s.b] as number), (y[s.a] as number) - (y[s.b] as number));
    const t = tenths(meters, SPEED_KMH[CLASSES[s.road] as RoadClass]);
    const i = (fill[s.a] as number), j = (fill[s.b] as number);
    fill[s.a] = i + 1; fill[s.b] = j + 1;
    head[i] = s.b; head[j] = s.a;
    time[i] = t; time[j] = t;
    length[i] = meters; length[j] = meters;
    road[i] = s.road; road[j] = s.road;
    twin[i] = j; twin[j] = i;
  }
  return { n, cols, x, y, first, head, time, length, road, twin };
}

// A city laid out as a grid: local streets, an arterial every 8th line, a highway every 32nd.
// Corners are moved a little at random, and some local streets are missing.
export function roadGrid(cols: number, rows: number, seed: number, spacing = 250, missing = 0.12): Graph {
  const random = seeded(seed);
  const n = cols * rows;
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      x[r * cols + c] = c * spacing + (random() - 0.5) * spacing * 0.4;
      y[r * cols + c] = r * spacing + (random() - 0.5) * spacing * 0.4;
    }
  const classOfLine = (k: number) => (k % 32 === 16 ? 2 : k % 8 === 4 ? 1 : 0);
  const segments: { a: number; b: number; road: number }[] = [];
  const add = (a: number, b: number, road: number) => {
    if (road === 0 && random() < missing) return;
    segments.push({ a, b, road });
  };
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const v = r * cols + c;
      if (c + 1 < cols) add(v, v + 1, classOfLine(r));       // along row r
      if (r + 1 < rows) add(v, v + cols, classOfLine(c));    // along column c
    }
  return fromSegments(n, cols, x, y, segments);
}

// Nodes reachable from v (a grid with missing streets can strand a corner or two).
export function component(g: Graph, v: number): Uint8Array {
  const seen = new Uint8Array(g.n);
  const stack = [v];
  seen[v] = 1;
  while (stack.length > 0) {
    const u = stack.pop() as number;
    for (let e = g.first[u] as number; e < (g.first[u + 1] as number); e += 1) {
      const w = g.head[e] as number;
      if (!seen[w]) { seen[w] = 1; stack.push(w); }
    }
  }
  return seen;
}

// Live traffic changes a segment's travel time in both directions.
export function setTime(g: Graph, edge: number, time: number): void {
  g.time[edge] = time;
  g.time[g.twin[edge] as number] = time;
}

export function edgeBetween(g: Graph, a: number, b: number): number {
  for (let e = g.first[a] as number; e < (g.first[a + 1] as number); e += 1) if (g.head[e] === b) return e;
  return -1;
}
