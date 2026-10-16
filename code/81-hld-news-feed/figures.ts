// Prints the data behind the chapter's charts as JSON: node lld/ts81/figures.ts > ch81/figures.json
import { graphStats, thresholdRow } from './costs.ts';
import { simulateFanout } from './fanout.ts';
import type { FanoutPolicy } from './fanout.ts';
import { fanoutConfig, network, THRESHOLDS } from './scenario.ts';
import { funnel, RANKING, secondPage } from './ranking.ts';

const g = network();
const cfg = fanoutConfig(g);
const policies: FanoutPolicy[] = ['one job per post', 'batches, first come first served', 'batches, small posts first', 'hybrid: no fan-out for the celebrity'];
const fanout = policies.map((p) => {
  const r = simulateFanout(cfg, p);
  // The worst lag among ordinary posts published in each second.
  const worst = new Array<number>(cfg.seconds).fill(0);
  r.arrivals.forEach((a, i) => {
    const s = Math.floor(a);
    worst[s] = Math.max(worst[s] as number, r.lags[i] as number);
  });
  return {
    policy: p,
    worstBySecond: worst.map((x) => Number(x.toFixed(3))),
    celebrityHalf: Number(r.celebrityHalf.toFixed(1)),
    celebrityAll: Number(r.celebrityAll.toFixed(1)),
    reach: Array.from(r.celebrityReach, (x) => Number(x.toFixed(4))),
  };
});
const rows = THRESHOLDS.map((T) => {
  const r = thresholdRow(g, T);
  return { ...r, threshold: T === Infinity ? 'none' : T };
});
const ranking = { config: RANKING, ...funnel(RANKING, 1_000, [20, 30, 50, 75, 100, 150, 200, 300, 400, 600, 800], 6), secondPage: secondPage(RANKING, 1_000, 8) };
console.log(JSON.stringify({ stats: graphStats(g), rows, config: { ...cfg, followerCounts: undefined }, fanout, ranking }));
