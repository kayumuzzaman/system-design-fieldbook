import { dot, type Hit, type Vector } from "./vectors.ts";

// Scalar quantization: each number is stored in one byte instead of four, as one of 256 steps between the
// smallest and largest value that dimension takes in the data.
export class ScalarQuantizer {
  private readonly low: Float32Array;
  private readonly step: Float32Array;
  constructor(data: readonly Vector[]) {
    const dims = (data[0] as Vector).length;
    this.low = new Float32Array(dims).fill(Infinity);
    const high = new Float32Array(dims).fill(-Infinity);
    for (const v of data) v.forEach((x, d) => { this.low[d] = Math.min(this.low[d] as number, x); high[d] = Math.max(high[d] as number, x); });
    this.step = this.low.map((l, d) => ((high[d] as number) - l) / 255 || 1);
  }
  encode(v: Vector): Uint8Array {
    return Uint8Array.from(v, (x, d) => Math.max(0, Math.min(255, Math.round((x - (this.low[d] as number)) / (this.step[d] as number)))));
  }
  decode(code: Uint8Array): Vector {
    return Float32Array.from(code, (q, d) => (this.low[d] as number) + q * (this.step[d] as number));
  }
}

// Binary quantization: keep only the sign of each number, one bit. Closeness becomes the number of signs
// that agree.
export function signBits(v: Vector): Uint8Array {
  const bits = new Uint8Array(Math.ceil(v.length / 8));
  v.forEach((x, d) => { if (x > 0) bits[d >> 3] = (bits[d >> 3] as number) | (1 << (d & 7)); });
  return bits;
}
export function agreeing(a: Uint8Array, b: Uint8Array): number {
  let same = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = ~((a[i] as number) ^ (b[i] as number)) & 0xff;
    for (; x; x &= x - 1) same += 1;
  }
  return same;
}

// Search the compressed copies, then re-score the best `recheck` against the full vectors, which may live
// on disk because only a few are read.
export function searchCompressed(score: (id: number) => number, count: number, full: readonly Vector[], query: Vector, k: number, recheck: number): Hit[] {
  const rough: Hit[] = Array.from({ length: count }, (_, id) => ({ id, score: score(id) })).sort((a, b) => b.score - a.score);
  if (recheck <= k) return rough.slice(0, k);
  return rough.slice(0, recheck).map((h) => ({ id: h.id, score: dot(query, full[h.id] as Vector) })).sort((a, b) => b.score - a.score).slice(0, k);
}
