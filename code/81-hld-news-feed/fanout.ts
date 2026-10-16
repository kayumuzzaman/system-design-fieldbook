import { MinHeap } from './heap.ts';
import { Rng } from './rng.ts';

// A pool of fan-out workers fed by a queue. Ordinary posts arrive at random; at one moment an account
// with millions of followers posts. The simulation records when each post has reached all its followers.
export type FanoutPolicy = 'one job per post' | 'batches, first come first served' | 'batches, small posts first' | 'hybrid: no fan-out for the celebrity';

export type FanoutConfig = {
  readonly workers: number;
  readonly insertsPerSecond: number;   // per worker
  readonly postsPerSecond: number;     // ordinary posts
  readonly seconds: number;            // ordinary posts arrive during [0, seconds)
  readonly followerCounts: Int32Array; // ordinary posts draw their audience from these
  readonly celebrityAt: number;
  readonly celebrityFollowers: number;
  readonly batch: number;              // followers per job, when batching
  readonly seed: number;
};

type Job = { readonly post: number; readonly size: number; readonly at: number };

export type FanoutResult = {
  readonly policy: FanoutPolicy;
  readonly arrivals: Float64Array;   // when each ordinary post was published
  readonly lags: Float64Array;       // seconds until it reached its last follower
  readonly celebrityHalf: number;    // seconds until half the celebrity's followers had the post
  readonly celebrityAll: number;
  readonly celebrityReach: Float64Array; // share of the celebrity's followers reached, each second after the post
};

export function simulateFanout(cfg: FanoutConfig, policy: FanoutPolicy): FanoutResult {
  const rng = new Rng(cfg.seed);
  // Ordinary posts, then the celebrity's post as the last post index.
  const at: number[] = [], size: number[] = [];
  for (let t = rng.exponential(cfg.postsPerSecond); t < cfg.seconds; t += rng.exponential(cfg.postsPerSecond)) {
    at.push(t);
    size.push(cfg.followerCounts[rng.below(cfg.followerCounts.length)] as number);
  }
  const ordinary = at.length;
  at.push(cfg.celebrityAt);
  size.push(policy === 'hybrid: no fan-out for the celebrity' ? 0 : cfg.celebrityFollowers);

  // Turn posts into jobs, in order of arrival.
  const jobs: Job[] = [];
  const order = at.map((_, i) => i).sort((a, b) => (at[a] as number) - (at[b] as number));
  for (const p of order) {
    const n = size[p] as number, t = at[p] as number;
    if (n === 0) continue;
    if (policy === 'one job per post') jobs.push({ post: p, size: n, at: t });
    else for (let left = n; left > 0; left -= cfg.batch) jobs.push({ post: p, size: Math.min(cfg.batch, left), at: t });
  }

  // Each free worker takes the next job. With "small posts first", jobs of posts with more than
  // a hundred batches of followers wait in a second queue that is served only when the first is empty.
  const big = (j: Job) => policy === 'batches, small posts first' && (size[j.post] as number) > 100 * cfg.batch;
  const small: Job[] = [], large: Job[] = [];
  let si = 0, li = 0, next = 0;
  const free = new MinHeap<number>((a, b) => a < b);
  for (let w = 0; w < cfg.workers; w++) free.push(0);
  const done = new Float64Array(at.length);
  const celebrity = ordinary;
  const runs: [number, number, number][] = [];   // the celebrity's jobs: start, end, followers
  const enqueue = (j: Job) => (big(j) ? large : small).push(j);

  while (next < jobs.length || si < small.length || li < large.length) {
    let start = free.pop() as number;
    while (next < jobs.length && (jobs[next] as Job).at <= start) enqueue(jobs[next++] as Job);
    if (si === small.length && li === large.length) {           // idle until the next post arrives
      start = (jobs[next] as Job).at;
      while (next < jobs.length && (jobs[next] as Job).at <= start) enqueue(jobs[next++] as Job);
    }
    const job = si < small.length ? (small[si++] as Job) : (large[li++] as Job);
    const end = start + job.size / cfg.insertsPerSecond;
    free.push(end);
    done[job.post] = Math.max(done[job.post] as number, end);
    if (job.post === celebrity) runs.push([start, end, job.size]);
  }
  // A worker inserts at a steady rate, so the followers reached by time t can be added up job by job.
  const reached = (t: number) => runs.reduce((sum, [s, e, n]) => sum + n * Math.min(1, Math.max(0, (t - s) / (e - s))), 0);
  let lo = cfg.celebrityAt, hi = (done[celebrity] as number) || cfg.celebrityAt;
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (reached(mid) * 2 >= cfg.celebrityFollowers) hi = mid;
    else lo = mid;
  }
  const celebrityHalf = runs.length ? hi - cfg.celebrityAt : 0;
  const celebrityAll = runs.length ? (done[celebrity] as number) - cfg.celebrityAt : 0;
  const celebrityReach = Float64Array.from({ length: 121 }, (_, s) => (runs.length ? reached(cfg.celebrityAt + s) / cfg.celebrityFollowers : 1));
  const lags = new Float64Array(ordinary);
  for (let p = 0; p < ordinary; p++) lags[p] = (done[p] as number) - (at[p] as number);
  return { policy, arrivals: Float64Array.from(at.slice(0, ordinary)), lags, celebrityHalf, celebrityAll, celebrityReach };
}

// The q-th quantile (0..1) of a list of numbers.
export function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}
