// Prints the data behind the chapter's charts as JSON: node lld/ts83/figures.ts > ch83/figures.json
import { FAULTS, STRATEGIES, reliability } from './reliability.ts';
import { CAMPAIGN, OUTAGE, runTier } from './queues.ts';
import type { RetryPolicy } from './queues.ts';

const reliabilityRows = STRATEGIES.map((s) => reliability(FAULTS, s, 1_000_000, 83));
const campaign = (['one queue', 'a queue per priority'] as const).map((qp) => {
  const r = runTier(CAMPAIGN, qp, 'backoff with jitter');
  return { policy: qp, worstCriticalBySecond: r.worstCriticalBySecond.slice(0, 600).map((x) => Number(x.toFixed(2))) };
});
const policies: RetryPolicy[] = ['retry at once', 'retry after 1 s', 'backoff with jitter', 'backoff and a circuit breaker'];
const outage = policies.map((p) => {
  const r = runTier(OUTAGE, 'a queue per priority', p);
  return { policy: p, lost: r.lost, during: r.requestsPerSecond.slice(60, 120).reduce((a, b) => a + b, 0), cleared: r.requestsPerSecond.findIndex((x, i) => i > 120 && x < 0.99 * OUTAGE.capacity) };
});
console.log(JSON.stringify({ faults: FAULTS, reliability: reliabilityRows, campaignConfig: { ...CAMPAIGN }, campaign, outageConfig: { ...OUTAGE }, outage }));
