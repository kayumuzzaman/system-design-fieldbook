// Repeatable randomness: the same seed gives the same simulation on every run.
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

// A standard normal value, by the Box-Muller method.
export function normal(random: () => number): number {
  const u = 1 - random(); // in (0, 1], so the logarithm is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

// An exponential wait with the given mean.
export function exponential(random: () => number, mean: number): number {
  return -mean * Math.log(1 - random());
}

// A whole number drawn from a log-normal distribution with the given mean and spread (sigma of the logarithm).
// Most values are small and a few are very large: most pastes are read a few times, and a few by thousands.
export function lognormalCount(random: () => number, mean: number, sigma: number): number {
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.round(Math.exp(mu + sigma * normal(random)));
}

export function pick<T extends { readonly share: number }>(random: () => number, choices: readonly T[]): T {
  let r = random();
  for (const c of choices) {
    r -= c.share;
    if (r < 0) return c;
  }
  return choices[choices.length - 1] as T;
}
