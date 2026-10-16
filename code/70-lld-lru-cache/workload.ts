// Repeatable request streams for comparing eviction policies.
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Zipf popularity: the item of rank r is requested in proportion to 1 / r^skew. Returns a function that draws a rank from 0.
export function zipf(items: number, skew: number, random: () => number): () => number {
  const cumulative = new Float64Array(items);
  let sum = 0;
  for (let r = 0; r < items; r += 1) cumulative[r] = sum += 1 / (r + 1) ** skew;
  return () => {
    const target = random() * sum;
    let low = 0, high = items - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((cumulative[mid] as number) < target) low = mid + 1; else high = mid;
    }
    return low;
  };
}

export const ITEMS = 10_000;
export const REQUESTS = 200_000;

// Popularity that does not change.
export function steady(seed = 70): number[] {
  const draw = zipf(ITEMS, 1, seeded(seed));
  return Array.from({ length: REQUESTS }, draw);
}
// The same traffic, interrupted after every 2,000 requests by a job that reads 1,000 rarely used items one after another.
// The job's own requests are marked, so that the hit ratio can be measured for ordinary requests alone.
export function withScans(seed = 70): { requests: number[]; fromScan: boolean[] } {
  const draw = zipf(ITEMS, 1, seeded(seed));
  const requests: number[] = [], fromScan: boolean[] = [];
  let scanFrom = 5000;
  for (let ordinary = 0; ordinary < REQUESTS; ) {
    for (let i = 0; i < 2000; i += 1, ordinary += 1) { requests.push(draw()); fromScan.push(false); }
    for (let i = 0; i < 1000; i += 1) { requests.push(scanFrom + i); fromScan.push(true); }
    scanFrom = 5000 + ((scanFrom - 5000 + 1000) % 5000);
  }
  return { requests, fromScan };
}
// Popularity that moves: every 40,000 requests, a different set of items becomes the popular one.
export function shifting(seed = 70): number[] {
  const draw = zipf(ITEMS, 1, seeded(seed));
  return Array.from({ length: REQUESTS }, (_, i) => (draw() + Math.floor(i / 40_000) * 2000) % ITEMS);
}

// Runs a request stream through a cache used in the usual way: look, and on a miss, load and store.
// Requests marked in `skip` use the cache like any other, but are left out of the ratio.
export function hitRatio(cache: { get(key: number): unknown; put(key: number, value: number): void }, requests: readonly number[], skip?: readonly boolean[]): number {
  let hits = 0, counted = 0;
  for (let i = 0; i < requests.length; i += 1) {
    const key = requests[i] as number;
    const hit = cache.get(key) !== undefined;
    if (!hit) cache.put(key, key);
    if (skip?.[i]) continue;
    counted += 1;
    if (hit) hits += 1;
  }
  return hits / counted;
}
