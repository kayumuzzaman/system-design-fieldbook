import { Rng } from './rng.ts';

// A follow graph in compressed form: the accounts user u follows are
// followees[followeeStart[u]] up to followees[followeeStart[u + 1] - 1], and the same for followers.
export type Graph = {
  readonly users: number;
  readonly followeeStart: Int32Array;
  readonly followees: Int32Array;
  readonly followerStart: Int32Array;
  readonly followers: Int32Array;
};

export function followerCount(g: Graph, u: number): number {
  return (g.followerStart[u + 1] as number) - (g.followerStart[u] as number);
}
export function followeeCount(g: Graph, u: number): number {
  return (g.followeeStart[u + 1] as number) - (g.followeeStart[u] as number);
}

// Walker's alias method: after O(n) setup, picks index i with probability weights[i] / sum in O(1).
class Alias {
  private readonly prob: Float64Array;
  private readonly alias: Int32Array;
  constructor(weights: Float64Array) {
    const n = weights.length;
    let sum = 0;
    for (const w of weights) sum += w;
    this.prob = new Float64Array(n);
    this.alias = new Int32Array(n);
    const scaled = weights.map((w) => (w * n) / sum);
    const small: number[] = [], large: number[] = [];
    scaled.forEach((p, i) => (p < 1 ? small : large).push(i));
    while (small.length && large.length) {
      const s = small.pop() as number, l = large.pop() as number;
      this.prob[s] = scaled[s] as number;
      this.alias[s] = l;
      scaled[l] = (scaled[l] as number) + (scaled[s] as number) - 1;
      ((scaled[l] as number) < 1 ? small : large).push(l);
    }
    for (const i of [...small, ...large]) this.prob[i] = 1;
  }
  pick(rng: Rng): number {
    const i = rng.below(this.prob.length);
    return rng.next() < (this.prob[i] as number) ? i : (this.alias[i] as number);
  }
}

// Builds a synthetic social graph. Account i is chosen as a followee with weight 1 / (i + offset) ^ skew,
// so a few accounts are followed by very many people and most by few. The number of accounts each
// user follows is spread around `meanFollows` (log-normal), at least 1.
export function buildGraph(users: number, meanFollows: number, seed: number, skew = 1, offset = 30): Graph {
  const rng = new Rng(seed);
  const weights = new Float64Array(users);
  for (let i = 0; i < users; i++) weights[i] = 1 / Math.pow(i + offset, skew);
  const alias = new Alias(weights);
  const followeeStart = new Int32Array(users + 1);
  const lists: Int32Array[] = [];
  const indegree = new Int32Array(users);
  for (let u = 0; u < users; u++) {
    const want = Math.min(users - 1, 3000, Math.max(1, Math.round(meanFollows * Math.exp(0.8 * rng.normal() - 0.32))));
    const chosen = new Set<number>();
    let tries = 0;
    while (chosen.size < want && tries < want * 20) {
      const v = alias.pick(rng);
      tries++;
      if (v !== u) chosen.add(v);
    }
    const list = Int32Array.from(chosen).sort();
    for (const v of list) indegree[v] = (indegree[v] as number) + 1;
    lists.push(list);
    followeeStart[u + 1] = (followeeStart[u] as number) + list.length;
  }
  const followees = new Int32Array(followeeStart[users] as number);
  lists.forEach((list, u) => followees.set(list, followeeStart[u] as number));
  // Invert the edges to get each account's followers.
  const followerStart = new Int32Array(users + 1);
  for (let v = 0; v < users; v++) followerStart[v + 1] = (followerStart[v] as number) + (indegree[v] as number);
  const fill = followerStart.slice(0, users);
  const followers = new Int32Array(followees.length);
  for (let u = 0; u < users; u++) {
    for (let k = followeeStart[u] as number; k < (followeeStart[u + 1] as number); k++) {
      const v = followees[k] as number;
      followers[fill[v] as number] = u;
      fill[v] = (fill[v] as number) + 1;
    }
  }
  return { users, followeeStart, followees, followerStart, followers };
}
