// How long to wait before retry number `attempt` (counted from 1), in milliseconds.
export type Backoff = (attempt: number) => number;

export const exponential = (base: number, cap: number): Backoff => (attempt) => Math.min(cap, base * 2 ** (attempt - 1));

// Full jitter: a random wait between zero and what the inner backoff says.
export const fullJitter = (inner: Backoff, random: () => number): Backoff => (attempt) => Math.floor(random() * inner(attempt));

// A small seeded generator (mulberry32), so that every run of a test draws the same "random" numbers.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
