import { seeded } from "./random.ts";

// A month of a game: players finish matches at random times and earn points. A few players
// play a lot and many play a little, so final points are spread like a log-normal distribution.
export interface ScoreEvent { player: string; points: number; second: number }

export function season(players: number, matches: number, seed: number): ScoreEvent[] {
  const random = seeded(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  // how often each player plays: log-normal weights, turned into a table to sample from
  const weight = Array.from({ length: players }, () => Math.exp(1.1 * gauss()));
  const cumulative: number[] = [];
  let sum = 0;
  for (const w of weight) { sum += w; cumulative.push(sum); }
  const pick = () => {
    const r = random() * sum;
    let lo = 0, hi = players - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((cumulative[mid] as number) < r) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const events: ScoreEvent[] = [];
  for (let i = 0; i < matches; i += 1) {
    const second = Math.floor((i / matches) * 2_678_400);
    events.push({ player: `p${pick()}`, points: 10 + Math.floor(random() * 41), second });
  }
  return events;
}
