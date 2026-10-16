import { Money } from "./money.ts";

// A small random number generator with a seed, so that a failing run can be repeated exactly.
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

// A property: a statement that must hold for every input. Here, two of them, for any amount and any number of shares.
export function checkSplit(runs: number, seed: number): { runs: number; failure: string | null } {
  const random = seeded(seed);
  for (let i = 0; i < runs; i += 1) {
    const cents = Math.floor(random() * 10_000_000);
    const shares = 1 + Math.floor(random() * 50);
    const parts = Money.of(cents, "EUR").split(shares).map((money) => money.cents);
    const sum = parts.reduce((a, b) => a + b, 0);
    const spread = Math.max(...parts) - Math.min(...parts);
    if (sum !== cents) return { runs: i + 1, failure: `${cents} split ${shares} ways adds up to ${sum}` };
    if (spread > 1) return { runs: i + 1, failure: `${cents} split ${shares} ways has shares ${spread} cents apart` };
  }
  return { runs, failure: null };
}

// The same property against the obvious wrong implementation, to show that the check can fail.
export function checkNaiveSplit(runs: number, seed: number): { runs: number; failure: string | null } {
  const random = seeded(seed);
  for (let i = 0; i < runs; i += 1) {
    const cents = Math.floor(random() * 10_000_000);
    const shares = 1 + Math.floor(random() * 50);
    const sum = Math.round(cents / shares) * shares;
    if (sum !== cents) return { runs: i + 1, failure: `${cents} split ${shares} ways adds up to ${sum}` };
  }
  return { runs, failure: null };
}
