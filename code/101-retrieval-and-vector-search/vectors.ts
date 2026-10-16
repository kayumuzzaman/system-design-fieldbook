import { gaussian, seeded } from "./random.ts";

export type Vector = Float32Array;

export function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] as number) * (b[i] as number);
  return s;
}
export function unit(v: Vector): Vector {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

// Counts every comparison of two vectors: the unit of work of a vector search.
export class Counter { n = 0; }

// For vectors of length 1, cosine similarity is the dot product. Larger is closer.
export function similarity(a: Vector, b: Vector, counter?: Counter): number {
  if (counter) counter.n += 1;
  return dot(a, b);
}

export interface Hit { id: number; score: number }

// Exact search: compare the query with every vector and keep the k best. Always right, and the cost grows
// in step with the number of vectors.
export function exactSearch(vectors: readonly Vector[], query: Vector, k: number, counter?: Counter): Hit[] {
  const best: Hit[] = [];
  for (let id = 0; id < vectors.length; id += 1) {
    const score = similarity(query, vectors[id] as Vector, counter);
    if (best.length < k || score > (best[best.length - 1] as Hit).score) {
      best.push({ id, score });
      best.sort((a, b) => b.score - a.score);
      if (best.length > k) best.pop();
    }
  }
  return best;
}

// The share of the true k nearest that a search found.
export function recall(found: readonly Hit[], truth: readonly Hit[]): number {
  const want = new Set(truth.map((h) => h.id));
  return found.filter((h) => want.has(h.id)).length / truth.length;
}

// Test data shaped like embeddings: many dimensions, but points that vary along far fewer directions (here
// 16 hidden ones, mapped into `dims` numbers), loosely grouped around `centers`, each scaled to length 1.
export function embeddingLike(count: number, dims: number, seed: number, centers = 50, hidden = 16, spread = 0.6): Vector[] {
  const random = seeded(seed);
  const map = Array.from({ length: dims }, () => Float32Array.from({ length: hidden }, () => gaussian(random)));
  const middles = Array.from({ length: centers }, () => Float32Array.from({ length: hidden }, () => gaussian(random)));
  return Array.from({ length: count }, () => {
    const c = middles[Math.floor(random() * centers)] as Vector;
    const h = c.map((x) => x + spread * gaussian(random));
    return unit(Float32Array.from(map, (row) => dot(row, h) + 0.5 * gaussian(random)));
  });
}
