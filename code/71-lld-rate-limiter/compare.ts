// The five algorithms side by side on the same traffic. Used by the tests, and by figures.ts for the chapter's figures.
import { fixedWindow, gcra, slidingCounter, slidingLog, tokenBucket, type Algorithm, type Decision } from "./algorithms.ts";

export const all = (limit: number, windowMs: number) =>
  [tokenBucket, gcra, fixedWindow, slidingLog, slidingCounter].map((make) => make(limit, windowMs) as Algorithm<unknown>);

// Feeds one client's request times through an algorithm and returns the decisions.
export function run(algorithm: Algorithm<unknown>, times: readonly number[], cost = 1): Decision[] {
  let state = algorithm.start(times[0] ?? 0);
  return times.map((now) => {
    const { decision, next } = algorithm.decide(state, now, cost);
    state = next;
    return decision;
  });
}

// A small seeded generator, so that every run sees the same "random" traffic.
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// Limit 4 a second: a burst at the end of one window, another at the start of the next, then a steady trickle.
export function boundary(): { times: number[]; rows: { name: string; allowed: boolean[] }[] } {
  const times = [800, 830, 860, 890, 920, 950, 1000, 1030, 1060, 1090, 1120, 1150];
  for (let t = 1400; t <= 2800; t += 200) times.push(t);
  return { times, rows: all(4, 1000).map((a) => ({ name: a.name, allowed: run(a, times).map((d) => d.allowed) })) };
}

// Bursty traffic for one client, limit 10 a second: the most requests allowed in any one-second span, and the average.
export function worstSpans(): Record<string, { span: number; perSecond: number }> {
  const random = seeded(7);
  const times: number[] = [];
  let t = 0;
  while (times.length < 100_000) { // bursts of up to 30 requests, separated by quiet gaps of up to two seconds
    t += Math.floor(random() * 2000);
    const n = 1 + Math.floor(random() * 30);
    for (let i = 0; i < n; i += 1) times.push((t += Math.floor(random() * 10)));
  }
  const result: Record<string, { span: number; perSecond: number }> = {};
  for (const algorithm of all(10, 1000)) {
    const decisions = run(algorithm, times);
    const ok = times.filter((_, i) => decisions[i]?.allowed);
    let most = 0;
    for (let i = 0, j = 0; i < ok.length; i += 1) {
      while ((ok[i] as number) - (ok[j] as number) >= 1000) j += 1;
      most = Math.max(most, i - j + 1);
    }
    result[algorithm.name] = { span: most, perSecond: Math.round((ok.length / ((times.at(-1) as number) / 1000)) * 100) / 100 };
  }
  return result;
}
