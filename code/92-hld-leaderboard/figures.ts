// Prints the data behind the chapter's shard figure as JSON: `node figures.ts > figures.json`.
// The same month as test92.ts (seeded), so the numbers match what the test prints.
import { season } from "./season.ts";
import { SLOT } from "./score.ts";

const players = 50_000;
const events = season(players, 500_000, 7), lastMonth = season(players, 500_000, 8);
const last = new Map<string, number>();
for (const e of lastMonth) last.set(e.player, (last.get(e.player) ?? 0) + e.points);
const sorted = [...last.values()].sort((a, b) => a - b);
const top = sorted[sorted.length - 1] as number;
const eighths = [0, ...[1, 2, 3, 4, 5, 6, 7].map((k) => sorted[Math.floor((sorted.length * k) / 8)] as number)];
const equal = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.floor((top * k) / 8));
const shardOf = (bounds: number[], p: number) => { let i = 0; while (i + 1 < bounds.length && p >= (bounds[i + 1] as number)) i += 1; return i; };
const sizes = (bounds: number[], pts: Iterable<number>) => { const n = bounds.map(() => 0); for (const p of pts) n[shardOf(bounds, p)] = (n[shardOf(bounds, p)] as number) + 1; return n; };
const points = new Map<string, number>();
let mid: number[] = [];
events.forEach((e, i) => {
  points.set(e.player, (points.get(e.player) ?? 0) + e.points);
  if (i === events.length / 2 - 1) mid = sizes(eighths, points.values());
});
console.log(JSON.stringify({ slot: SLOT, equalBounds: equal, eighthBounds: eighths, equalEnd: sizes(equal, points.values()), eighthsMid: mid, eighthsEnd: sizes(eighths, points.values()) }));
