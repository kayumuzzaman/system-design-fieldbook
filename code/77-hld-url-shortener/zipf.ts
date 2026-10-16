import type { Rng } from "./rng.ts";

// Uneven popularity in the usual shape: the link of rank r gets clicks in proportion to 1 / r^skew.
export class Zipf {
  readonly n: number;
  readonly skew: number;
  private readonly cumulative: Float64Array;

  constructor(n: number, skew: number) {
    this.n = n;
    this.skew = skew;
    this.cumulative = new Float64Array(n);
    let sum = 0;
    for (let r = 1; r <= n; r++) {
      sum += r ** -skew;
      this.cumulative[r - 1] = sum;
    }
  }

  // The rank of one random click, from 0 for the most popular link.
  sample(rng: Rng): number {
    const u = rng.float() * this.cumulative[this.n - 1];
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cumulative[mid] > u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  // The share of all clicks that go to the k most popular links: the best any cache of k entries can do.
  topShare(k: number): number {
    return this.cumulative[Math.min(k, this.n) - 1] / this.cumulative[this.n - 1];
  }
}

// The sum of 1 / r^skew for r = 1 .. n, for n too large to sum one term at a time:
// the first million terms exactly, the rest by the Euler-Maclaurin formula.
export function harmonic(n: number, skew: number): number {
  const m = Math.min(n, 1_000_000);
  let sum = 0;
  for (let r = 1; r <= m; r++) sum += r ** -skew;
  if (n === m) return sum;
  const integral = skew === 1 ? Math.log(n / m) : (n ** (1 - skew) - m ** (1 - skew)) / (1 - skew);
  return sum + integral + (n ** -skew - m ** -skew) / 2 + (skew / 12) * (m ** (-skew - 1) - n ** (-skew - 1));
}
