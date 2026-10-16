import assert from "node:assert/strict";
import { SortedSet } from "./sortedset.ts";
import { packed, pointsOf, SLOT } from "./score.ts";
import { HashShards, RangeShards } from "./shards.ts";
import { PointsHistogram } from "./histogram.ts";
import { season } from "./season.ts";
import { seeded } from "./random.ts";

const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

// --- the sorted set agrees with a plain sorted array on random operations
{
  const random = seeded(1);
  const set = new SortedSet(random);
  const plain = new Map<string, number>();
  const order = () => [...plain].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)).map(([m]) => m);
  for (let i = 0; i < 20_000; i += 1) {
    const m = `m${Math.floor(random() * 2000)}`, op = random();
    if (op < 0.4) { const s = Math.floor(random() * 500); set.add(m, s); plain.set(m, s); }
    else if (op < 0.7) { const d = Math.floor(random() * 50); assert.equal(set.incrBy(m, d), (plain.get(m) ?? 0) + d); plain.set(m, (plain.get(m) ?? 0) + d); }
    else if (op < 0.8) { assert.equal(set.remove(m), plain.delete(m)); }
    else if (op < 0.9) { const o = order(); assert.equal(set.revRank(m), o.indexOf(m) < 0 ? undefined : o.indexOf(m)); }
    else if (op < 0.95) { const a = Math.floor(random() * 20); assert.deepEqual(set.revRange(a, a + 9).map((x) => x.member), order().slice(a, a + 10)); }
    else { const s = Math.floor(random() * 600); assert.equal(set.countAbove(s), [...plain.values()].filter((v) => v > s).length); }
  }
  assert.equal(set.size, plain.size);
  console.log("sorted set: matched a plain sorted list on 20,000 random operations");
}

// --- the work of finding a rank grows with log n, not n
for (const n of [1_000, 10_000, 100_000]) {
  const random = seeded(n);
  const set = new SortedSet(random);
  for (let i = 0; i < n; i += 1) set.add(`p${i}`, Math.floor(random() * 1e9));
  let steps = 0;
  for (let i = 0; i < 1000; i += 1) { set.revRank(`p${Math.floor(random() * n)}`); steps += set.steps; }
  console.log(`  ${fmt(n).padStart(7)} players: a rank takes ${fmt(steps / 1000)} steps on average (log2 n = ${Math.log2(n).toFixed(1)}); counting the players above takes ${fmt(n / 2)} on average`);
}

// --- ties: equal points sort by name unless the time is packed into the score
{
  const byPoints = new SortedSet(seeded(2)), byPacked = new SortedSet(seeded(2));
  const reached: [string, number][] = [["carol", 100], ["alice", 200], ["bob", 300]];   // second of the month
  for (const [who, at] of reached) { byPoints.add(who, 500); byPacked.add(who, packed(500, at)); }
  const a = byPoints.revRange(0, 2).map((x) => x.member), b = byPacked.revRange(0, 2).map((x) => x.member);
  console.log(`ties at 500 points, reached by carol, then alice, then bob: points alone rank ${a.join(", ")}; packed with time ${b.join(", ")}`);
  assert.deepEqual(a, ["carol", "bob", "alice"]);
  assert.deepEqual(b, ["carol", "alice", "bob"]);
  assert.ok(Number.isSafeInteger(packed(2 ** 31 - 1, 0)));
  assert.equal(pointsOf(packed(12_345, 2_678_399)), 12_345);
  assert.throws(() => packed(2 ** 31, 0), RangeError);
  console.log(`packed scores stay exact: the largest is ${fmt(packed(2 ** 31 - 1, 0))}, below 2^53 = ${fmt(2 ** 53)}`);
}

// --- a month: 50,000 players, 500,000 matches; one board against two ways of sharding it
{
  const players = 50_000;
  const events = season(players, 500_000, 7);
  const lastMonth = season(players, 500_000, 8);
  // range bounds from last month's final points, so that each shard would hold an eighth
  const last = new Map<string, number>();
  for (const e of lastMonth) last.set(e.player, (last.get(e.player) ?? 0) + e.points);
  const sorted = [...last.values()].sort((a, b) => a - b);
  const quantileBounds = [0, ...[1, 2, 3, 4, 5, 6, 7].map((k) => (sorted[Math.floor((sorted.length * k) / 8)] as number) * SLOT)];
  const top = sorted[sorted.length - 1] as number;
  const widthBounds = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.floor((top * k) / 8) * SLOT);

  const random = seeded(3);
  const board = new SortedSet(random);
  const hashed = new HashShards(8, random);
  const histogram = new PointsHistogram();
  const points = new Map<string, number>();
  const shardOf = (bounds: number[], score: number) => { let i = 0; while (i + 1 < bounds.length && score >= (bounds[i + 1] as number)) i += 1; return i; };
  const sizesOf = (bounds: number[], scores: Iterable<number>) => { const n = bounds.map(() => 0); for (const x of scores) n[shardOf(bounds, x)] = (n[shardOf(bounds, x)] as number) + 1; return n; };
  let half: number[] = [], moves = 0;
  events.forEach((e, i) => {
    const before = points.get(e.player);
    const now = (before ?? 0) + e.points;
    points.set(e.player, now);
    const score = packed(now, e.second);
    const old = before === undefined ? undefined : (board.score(e.player) as number);
    board.add(e.player, score);
    hashed.add(e.player, score);
    if (old !== undefined && shardOf(quantileBounds, old) !== shardOf(quantileBounds, score)) moves += 1;
    histogram.add(now, before);
    if (i === events.length / 2 - 1) half = sizesOf(quantileBounds, [...points.values()].map((x) => x * SLOT));
  });
  const finals = [...points.keys()].map((p) => board.score(p) as number);
  const byQuantile = new RangeShards(quantileBounds, random);
  for (const p of points.keys()) byQuantile.add(p, board.score(p) as number);
  console.log(`month: ${fmt(points.size)} players, ${fmt(events.length)} matches; top score ${fmt(pointsOf(board.revRange(0, 0)[0]?.score as number))} points`);

  // hash shards give the same answers, at the cost of asking every shard
  assert.deepEqual(hashed.top(10).map((x) => x.member), board.revRange(0, 9).map((x) => x.member));
  const r = seeded(4);
  let checked = 0;
  hashed.calls = 0;
  for (let i = 0; i < 1000; i += 1) {
    const p = `p${Math.floor(r() * players)}`;
    if (!points.has(p)) continue;
    assert.equal(hashed.revRank(p), board.revRank(p));
    checked += 1;
  }
  console.log(`8 shards by hash: top 10 and ${checked} ranks equal to one board; ${fmt(hashed.calls / checked)} calls per rank, 8 per top 10`);

  // range shards: uneven, and players move between them
  const spread = (sizes: number[]) => `${sizes.map((x) => fmt(x)).join(" / ")} (largest ${(Math.max(...sizes) / (sizes.reduce((a, b) => a + b, 0) / sizes.length)).toFixed(1)}x the average)`;
  console.log(`8 shards by equal ranges of points: ${spread(sizesOf(widthBounds, finals))}`);
  console.log(`8 shards by last month's eighths: at the end ${spread(byQuantile.sizes())}`);
  console.log(`   at mid-month ${spread(half)}`);
  console.log(`   ${fmt(moves)} of ${fmt(events.length)} updates (${((moves / events.length) * 100).toFixed(1)}%) moved a player to another shard`);
  assert.deepEqual(byQuantile.sizes(), sizesOf(quantileBounds, finals));
  for (let i = 0; i < 200; i += 1) {
    const p = `p${Math.floor(r() * players)}`;
    if (points.has(p)) assert.equal(byQuantile.revRank(p, board.score(p) as number), board.revRank(p));
  }

  // the long tail: a percentile from a histogram instead of an exact rank
  let err = 0, worst = 0, n = 0;
  for (let i = 0; i < 2000; i += 1) {
    const p = `p${Math.floor(r() * players)}`;
    const pts = points.get(p);
    if (pts === undefined) continue;
    const exact = (board.revRank(p) as number) / points.size, estimate = histogram.shareAbove(pts);
    err += Math.abs(exact - estimate); worst = Math.max(worst, Math.abs(exact - estimate)); n += 1;
  }
  console.log(`percentile from a 200-bucket histogram: off by ${((err / n) * 100).toFixed(2)} points on average, ${(worst * 100).toFixed(2)} at worst, over ${fmt(n)} players`);
  assert.ok(err / n < 0.01);
}
// --- retries: increments count a retried match twice; totals written with GT do not
{
  const events = season(5_000, 50_000, 9);
  const random = seeded(10);
  // what the score service receives: 5% of matches delivered twice, and some pairs out of order
  const deliveries: number[] = [];
  events.forEach((_, i) => { deliveries.push(i); if (random() < 0.05) deliveries.push(i); });
  for (let i = 0; i + 1 < deliveries.length; i += 1) if (random() < 0.05) [deliveries[i], deliveries[i + 1]] = [deliveries[i + 1] as number, deliveries[i] as number];
  const byIncrement = new SortedSet(seeded(11)), byTotal = new SortedSet(seeded(11));
  const recorded = new Set<number>(), totals = new Map<string, number>(), truth = new Map<string, number>();
  for (const e of events) truth.set(e.player, (truth.get(e.player) ?? 0) + e.points);
  for (const i of deliveries) {
    const e = events[i] as (typeof events)[number];
    byIncrement.incrBy(e.player, e.points);                       // ZINCRBY on every delivery
    if (!recorded.has(i)) {                                       // the database's unique match id
      recorded.add(i);
      totals.set(e.player, (totals.get(e.player) ?? 0) + e.points);
    }
    byTotal.addIfGreater(e.player, packed(totals.get(e.player) as number, e.second));   // ZADD GT with the total
  }
  let wrongIncrement = 0, wrongTotal = 0;
  for (const [p, pts] of truth) {
    if (byIncrement.score(p) !== pts) wrongIncrement += 1;
    if (pointsOf(byTotal.score(p) as number) !== pts) wrongTotal += 1;
  }
  console.log(`retries: ${fmt(deliveries.length - events.length)} repeated deliveries of ${fmt(events.length)} matches; ZINCRBY left ${fmt(wrongIncrement)} of ${fmt(truth.size)} players with the wrong score, ZADD GT of the total left ${wrongTotal}`);
  assert.equal(wrongTotal, 0);
  assert.ok(wrongIncrement > 0);
}
console.log("ok");
