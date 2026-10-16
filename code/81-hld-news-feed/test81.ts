import assert from 'node:assert/strict';
import { buildGraph } from './graph.ts';
import { HybridFeed, PullFeed, PushFeed } from './feed.ts';
import type { FeedStrategy } from './feed.ts';
import { graphStats, thresholdRow } from './costs.ts';
import { quantile, simulateFanout } from './fanout.ts';
import type { FanoutPolicy } from './fanout.ts';
import { Rng } from './rng.ts';
import { funnel, RANKING, secondPage } from './ranking.ts';
import { fanoutConfig, network, THRESHOLDS } from './scenario.ts';

const pct = (x: number) => (x * 100).toFixed(1) + '%';

// 1. Every strategy shows every reader the same feed.
{
  const g = buildGraph(3_000, 40, 3);
  const strategies: FeedStrategy[] = [new PushFeed(g, 300), new PullFeed(g, 300), new HybridFeed(g, 300, 200), new HybridFeed(g, 300, 50)];
  const rng = new Rng(4);
  let compared = 0, posts = 0;
  for (let round = 0; round < 30; round++) {
    for (let i = 0; i < 1_000; i++) {
      const post = { id: ++posts, author: rng.below(g.users) };
      for (const s of strategies) s.publish(post);
    }
    for (let i = 0; i < 200; i++) {
      const reader = rng.below(g.users);
      const first = strategies.map((s) => s.read(reader, 20));
      const cursor = first[0]?.at(-1) ?? Infinity;
      const second = strategies.map((s) => s.read(reader, 20, cursor));
      for (let k = 1; k < strategies.length; k++) {
        assert.deepEqual(first[k], first[0]);
        assert.deepEqual(second[k], second[0]);
      }
      compared++;
    }
  }
  console.log(`same two pages from all ${strategies.length} strategies for ${compared.toLocaleString('en-US')} reads after ${posts.toLocaleString('en-US')} posts`);
  for (const s of strategies) {
    console.log(`  ${s.name.padEnd(22)} inserts per post ${(s.work.inserts / posts).toFixed(1).padStart(5)}   timelines per page ${(s.work.timelinesRead / (2 * compared)).toFixed(1).padStart(5)}`);
  }
  // The counters agree with the formulas used for the large network.
  // Posts come from random authors, so the measured inserts are close to the formula's, not equal.
  for (const [s, T] of [[strategies[0], Infinity], [strategies[1], 0], [strategies[2], 200], [strategies[3], 50]] as const) {
    const row = thresholdRow(g, T);
    const inserts = (s as FeedStrategy).work.inserts / posts, lists = (s as FeedStrategy).work.timelinesRead / (2 * compared);
    assert.ok(Math.abs(inserts - row.insertsPerPost) / row.insertsPerPost < 0.03, `${s.name} inserts`);
    assert.ok(Math.abs(lists - row.timelinesPerRead) / row.timelinesPerRead < 0.06, `${s.name} lists`);
  }
}

// 2. The network the chapter measures.
const g = network();
const st = graphStats(g);
console.log(`\nnetwork: ${st.users.toLocaleString('en-US')} accounts, ${st.follows.toLocaleString('en-US')} follows`);
console.log(`  followers: mean ${st.meanFollowers.toFixed(1)}, median ${st.medianFollowers}, most ${st.maxFollowers.toLocaleString('en-US')}; the 100 most followed hold ${pct(st.top100Share)} of all follows`);
console.log(`  following: median ${st.medianFollows}, most ${st.maxFollows}`);

// 3. Fan-out on write, on read, and the hybrid at each celebrity threshold.
console.log('\nthreshold   celebrities  follows to them  inserts/post  largest fan-out  timelines/read  p99');
for (const T of THRESHOLDS) {
  const r = thresholdRow(g, T);
  const name = T === Infinity ? 'none (push)' : T === 0 ? 'all (pull)' : T.toLocaleString('en-US');
  console.log(`${name.padEnd(12)}${String(r.celebrities).padStart(11)}${pct(r.followsToCelebrities).padStart(17)}${r.insertsPerPost.toFixed(1).padStart(14)}${r.maxInsertsPerPost.toLocaleString('en-US').padStart(17)}${r.timelinesPerRead.toFixed(1).padStart(16)}${String(r.timelinesPerReadP99).padStart(5)}`);
}

// 4. A celebrity post arriving at a pool of fan-out workers.
const cfg = fanoutConfig(g);
console.log(`\nfan-out workers: ${cfg.workers} x ${cfg.insertsPerSecond.toLocaleString('en-US')} inserts/s; ${cfg.postsPerSecond} ordinary posts/s; at ${cfg.celebrityAt} s an account with ${cfg.celebrityFollowers.toLocaleString('en-US')} followers posts`);
const policies: FanoutPolicy[] = ['one job per post', 'batches, first come first served', 'batches, small posts first', 'hybrid: no fan-out for the celebrity'];
for (const p of policies) {
  const r = simulateFanout(cfg, p);
  const after: number[] = [];
  r.arrivals.forEach((a, i) => { if (a >= cfg.celebrityAt && a < cfg.celebrityAt + 60) after.push(r.lags[i] as number); });
  console.log(`  ${p.padEnd(37)} ordinary posts in the next minute: median ${quantile(after, 0.5).toFixed(2)} s, p99 ${quantile(after, 0.99).toFixed(2)} s, worst ${Math.max(...after).toFixed(2)} s;` +
    ` celebrity: half ${r.celebrityHalf.toFixed(1)} s, all ${r.celebrityAll.toFixed(1)} s`);
}
const load = Array.from(cfg.followerCounts).reduce((a, b) => a + b, 0) / cfg.followerCounts.length * cfg.postsPerSecond;
console.log(`  ordinary load ${Math.round(load).toLocaleString('en-US')} inserts/s of ${(cfg.workers * cfg.insertsPerSecond).toLocaleString('en-US')} (${pct(load / cfg.workers / cfg.insertsPerSecond)})`);

// 5. Pages by offset repeat posts when new ones arrive between page loads; pages by cursor do not.
{
  const small = buildGraph(3_000, 40, 3);
  const feed = new PushFeed(small, 300);
  const rng = new Rng(5);
  let id = 0;
  for (let i = 0; i < 20_000; i++) feed.publish({ id: ++id, author: rng.below(small.users) });
  let reader = 0;
  while ((small.followeeStart[reader + 1] as number) - (small.followeeStart[reader] as number) < 5) reader++;
  const page1 = feed.read(reader, 10);
  const followed = small.followees[small.followeeStart[reader] as number] as number;
  for (let i = 0; i < 4; i++) feed.publish({ id: ++id, author: followed });
  const byOffset = feed.read(reader, 20).slice(10);
  const byCursor = feed.read(reader, 10, page1.at(-1));
  const repeats = (page: number[]) => page.filter((x) => page1.includes(x)).length;
  console.log(`\npages: page 1 ${page1.join(' ')}; 4 new posts; page 2 by offset repeats ${repeats(byOffset)}, by cursor ${repeats(byCursor)}`);
  assert.equal(repeats(byOffset), 4);
  assert.equal(repeats(byCursor), 0);
}
// 6. Ranking: the full model scores only some candidates. Which ones it scores decides how good the page is.
{
  const ks = [20, 50, 100, 200, 400, 800];
  const f = funnel(RANKING, 1_000, ks, 6);
  console.log(`\nranking: ${RANKING.candidates} candidates over ${RANKING.windowHours} h, half-life ${RANKING.halfLifeHours} h, 1,000 readers; cheap model correlation ${f.correlation.toFixed(2)}`);
  console.log('  scored by the full model   share of the best page found: newest first   cheap model first');
  for (const r of f.rows) console.log(`  ${String(r.scored).padStart(24)} ${pct(r.newest).padStart(39)} ${pct(r.funnel).padStart(19)}`);
  const all = f.rows.at(-1) as { newest: number; funnel: number };
  assert.equal(all.newest, 1);
  assert.equal(all.funnel, 1);
  const p = secondPage(RANKING, 1_000, 8);
  console.log(`  page 2 half an hour later, ranked again: ${p.repeats.toFixed(2)} repeats, ${p.skipped.toFixed(2)} older posts never shown, ${p.arrived.toFixed(2)} new posts above it; from the saved order: ${p.savedRepeats.toFixed(2)} repeats`);
  assert.equal(p.savedRepeats, 0);
}
console.log('\nall checks passed');
