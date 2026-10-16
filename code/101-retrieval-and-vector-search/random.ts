// Repeatable randomness: the same seed always gives the same sequence.
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

// The time until the next arrival when arrivals are independent, at `rate` a second on average.
export function exponential(rate: number, random: () => number): number {
  return -Math.log(1 - random()) / rate;
}

// Zipf popularity: the item of rank r is drawn in proportion to 1 / (r + 1)^skew.
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

// A small, fast string hash (FNV-1a), used to make the stub model deterministic.
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] as number;
}

// A normally distributed number (Box-Muller), mean 0 and standard deviation 1.
export function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
