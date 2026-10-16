// How many pastes are alive on each day, when each one expires after the lifetime its creator chose.
import type { ExpiryChoice } from "./estimate.ts";
import { exponential, pick, seeded } from "./random.ts";

// live[d] is the number of pastes alive at the end of day d (at time d days): created before it, expiring after it.
export function liveByDay(pastesPerDay: number, days: number, mix: readonly ExpiryChoice[], seed: number): number[] {
  const random = seeded(seed);
  const born = new Float64Array(days + 1);
  const died = new Float64Array(days + 1);
  const meanGap = 1 / pastesPerDay;
  for (let t = exponential(random, meanGap); t < days; t += exponential(random, meanGap)) {
    born[Math.floor(t)] = (born[Math.floor(t)] as number) + 1;
    const end = t + pick(random, mix).days;
    if (end < days) died[Math.floor(end)] = (died[Math.floor(end)] as number) + 1;
  }
  const live = [0];
  let alive = 0;
  for (let d = 0; d < days; d += 1) {
    alive += (born[d] as number) - (died[d] as number);
    live.push(alive);
  }
  return live;
}
