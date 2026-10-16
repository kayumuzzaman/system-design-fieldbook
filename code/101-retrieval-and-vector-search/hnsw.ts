import { seeded } from "./random.ts";
import { Counter, dot, type Hit, type Vector } from "./vectors.ts";

// A hierarchical navigable small world graph. Every vector is a node on layer 0; a random few are also on
// layer 1, fewer on layer 2, and so on, each with links to near neighbors on every layer it is on. A search
// starts at the top, where links are long, walks greedily toward the query, and drops a layer each time it
// can get no closer.
export class Hnsw {
  private readonly vectors: Vector[] = [];
  private readonly links: number[][][] = []; // node -> layer -> neighbors
  private entry = -1;
  private top = -1;
  private readonly m: number;
  private readonly efConstruction: number;
  private readonly random: () => number;
  private readonly measure: (a: Vector, b: Vector) => number;
  readonly build = new Counter();

  // `measure` says how close two vectors are, larger meaning closer: the dot product for vectors of length 1.
  constructor(m = 12, efConstruction = 64, seed = 1, measure: (a: Vector, b: Vector) => number = dot) {
    this.m = m;
    this.efConstruction = efConstruction;
    this.random = seeded(seed);
    this.measure = measure;
  }
  private sim(a: Vector, b: Vector, counter: Counter): number {
    counter.n += 1;
    return this.measure(a, b);
  }
  get size(): number { return this.vectors.length; }
  layerOf(id: number): number { return (this.links[id] as number[][]).length - 1; }
  neighbors(id: number, layer: number): readonly number[] { return (this.links[id] as number[][])[layer] ?? []; }
  linkCount(): number { return this.links.reduce((a, l) => a + l.reduce((b, x) => b + x.length, 0), 0); }

  add(vector: Vector): number {
    const id = this.vectors.length;
    // The top layer of a node: 0 with probability 1 - 1/m, 1 with probability about 1/m, and so on.
    const level = Math.floor(-Math.log(1 - this.random()) / Math.log(this.m));
    this.vectors.push(vector);
    this.links.push(Array.from({ length: level + 1 }, () => []));
    if (this.entry < 0) { this.entry = id; this.top = level; return id; }
    let nearest = this.entry;
    for (let layer = this.top; layer > level; layer -= 1) nearest = this.greedy(vector, nearest, layer, this.build);
    for (let layer = Math.min(level, this.top); layer >= 0; layer -= 1) {
      const found = this.searchLayer(vector, [nearest], this.efConstruction, layer, this.build);
      const max = layer === 0 ? 2 * this.m : this.m;
      const chosen = this.diverse(vector, found, this.m);
      (this.links[id] as number[][])[layer] = chosen.map((h) => h.id);
      for (const h of chosen) {           // links go both ways; a node with too many keeps the best
        const theirs = (this.links[h.id] as number[][])[layer] as number[];
        theirs.push(id);
        if (theirs.length > max) {
          const base = this.vectors[h.id] as Vector;
          const scored = theirs.map((n) => ({ id: n, score: this.sim(base, this.vectors[n] as Vector, this.build) }));
          (this.links[h.id] as number[][])[layer] = this.diverse(base, scored.sort((a, b) => b.score - a.score), max).map((x) => x.id);
        }
      }
      nearest = (found[0] as Hit).id;
    }
    if (level > this.top) { this.top = level; this.entry = id; }
    return id;
  }

  // Keep a candidate only if it is closer to the new node than to any neighbor already kept. This spreads the
  // links in different directions, so that a cluster is not linked only to itself.
  private diverse(base: Vector, sorted: readonly Hit[], max: number): Hit[] {
    const kept: Hit[] = [];
    for (const c of sorted) {
      if (kept.length >= max) break;
      const cv = this.vectors[c.id] as Vector;
      if (kept.every((k) => this.sim(cv, this.vectors[k.id] as Vector, this.build) < c.score)) kept.push(c);
    }
    return kept;
  }

  // On one layer: move to whichever neighbor is closer to the query, until none is.
  private greedy(query: Vector, from: number, layer: number, counter: Counter, path?: number[]): number {
    let current = from, best = this.sim(query, this.vectors[from] as Vector, counter);
    path?.push(current);
    for (let moved = true; moved; ) {
      moved = false;
      for (const n of this.neighbors(current, layer)) {
        const s = this.sim(query, this.vectors[n] as Vector, counter);
        if (s > best) { best = s; current = n; moved = true; }
      }
      if (moved) path?.push(current);
    }
    return current;
  }

  // On one layer: a best-first search that keeps the `ef` closest nodes seen, and stops when the closest
  // unexplored candidate is farther than the farthest of those.
  private searchLayer(query: Vector, starts: number[], ef: number, layer: number, counter: Counter): Hit[] {
    const seen = new Set(starts);
    const results: Hit[] = starts.map((id) => ({ id, score: this.sim(query, this.vectors[id] as Vector, counter) }));
    const candidates = [...results];
    results.sort((a, b) => b.score - a.score);
    while (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      const c = candidates.pop() as Hit; // the closest unexplored
      if (results.length >= ef && c.score < (results[results.length - 1] as Hit).score) break;
      for (const n of this.neighbors(c.id, layer)) {
        if (seen.has(n)) continue;
        seen.add(n);
        const s = this.sim(query, this.vectors[n] as Vector, counter);
        if (results.length < ef || s > (results[results.length - 1] as Hit).score) {
          const hit = { id: n, score: s };
          candidates.push(hit);
          results.splice(results.findIndex((r) => r.score < s) === -1 ? results.length : results.findIndex((r) => r.score < s), 0, hit);
          if (results.length > ef) results.pop();
        }
      }
    }
    return results;
  }

  search(query: Vector, k: number, ef: number, counter = new Counter(), path?: number[][]): Hit[] {
    let nearest = this.entry;
    for (let layer = this.top; layer > 0; layer -= 1) {
      const p: number[] = [];
      nearest = this.greedy(query, nearest, layer, counter, p);
      path?.push(p);
    }
    if (path) {                     // for drawing: the greedy route on layer 0, not counted as work
      const p: number[] = [];
      this.greedy(query, nearest, 0, new Counter(), p);
      path.push(p);
    }
    return this.searchLayer(query, [nearest], Math.max(ef, k), 0, counter).slice(0, k);
  }
}
