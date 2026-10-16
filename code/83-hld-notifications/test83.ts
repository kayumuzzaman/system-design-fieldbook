import assert from 'node:assert/strict';
import { DedupStore, FAULTS, STRATEGIES, reliability } from './reliability.ts';
import { CAMPAIGN, OUTAGE, runTier } from './queues.ts';
import type { RetryPolicy } from './queues.ts';

const per = (x: number, n: number) => (x / n * 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });
const q = (a: number[], x: number) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(x * s.length))] as number; };

// 0. The dedup store: only one caller claims a key.
{
  const s = new DedupStore();
  assert.equal(s.claim('order-81723-shipped'), true);
  assert.equal(s.claim('order-81723-shipped'), false);
  assert.equal(s.state('order-81723-shipped'), 'sending');
  s.markSent('order-81723-shipped');
  assert.equal(s.state('order-81723-shipped'), 'sent');
}

// 1. Lost and duplicated notifications, per million, by strategy.
const N = 1_000_000;
console.log(`faults: producer retries ${FAULTS.producerRetry * 100}%, queue redelivery ${FAULTS.redelivery * 100}%, provider fails ${FAULTS.transient * 100}%, times out ${FAULTS.timeout * 100}% (sent in ${FAULTS.timeoutSent * 100}% of those), worker dies after sending ${FAULTS.crash * 100}%; up to ${FAULTS.maxAttempts} attempts`);
console.log('strategy                        lost/million  duplicates/million  from upstream  from timeouts  from crashes  provider calls');
const res = STRATEGIES.map((s) => reliability(FAULTS, s, N, 83));
for (const r of res) {
  console.log(`${r.strategy.padEnd(31)} ${per(r.lost, N).padStart(13)} ${per(r.duplicates, N).padStart(19)} ${per(r.causes.upstream, N).padStart(14)} ${per(r.causes.timeout, N).padStart(14)} ${per(r.causes.crash, N).padStart(13)} ${r.providerCalls.toLocaleString('en-US').padStart(15)}`);
}
const [once, noKey, key, careful, collapse] = res as [typeof res[0], typeof res[0], typeof res[0], typeof res[0], typeof res[0]];
assert.ok(once.lost > 0 && once.duplicates > 0);
assert.equal(noKey.lost, 0);
assert.ok(key.duplicates < noKey.duplicates / 4);
assert.equal(careful.duplicates, 0);
assert.ok(careful.lost > 0);
assert.equal(collapse.lost + collapse.duplicates, 0);

// 2. A two-million campaign lands on the senders.
console.log(`\ncampaign: ${CAMPAIGN.campaign?.size.toLocaleString('en-US')} at ${CAMPAIGN.campaign?.at} s; ${CAMPAIGN.arrivals.toLocaleString('en-US')} other notifications a second (${CAMPAIGN.criticalShare * 100}% critical); senders make ${CAMPAIGN.capacity.toLocaleString('en-US')} calls a second`);
for (const qp of ['one queue', 'a queue per priority'] as const) {
  const r = runTier(CAMPAIGN, qp, 'backoff with jitter');
  console.log(`  ${qp.padEnd(21)} critical: median ${q(r.latency.critical, 0.5).toFixed(1)} s, 99th percentile ${q(r.latency.critical, 0.99).toFixed(1)} s, worst ${Math.max(...r.latency.critical).toFixed(1)} s;` +
    ` normal 99th ${q(r.latency.normal, 0.99).toFixed(1)} s; campaign done after ${(q(r.latency.bulk, 1)).toFixed(0)} s`);
}

// 3. The provider is down for a minute.
console.log(`\noutage: provider fails every call from ${OUTAGE.outage?.from} s to ${OUTAGE.outage?.to} s; ${OUTAGE.arrivals.toLocaleString('en-US')} notifications a second; up to ${OUTAGE.maxAttempts} attempts`);
const policies: RetryPolicy[] = ['retry at once', 'retry after 1 s', 'backoff with jitter', 'backoff and a circuit breaker'];
const outage = policies.map((p) => runTier(OUTAGE, 'a queue per priority', p));
for (const r of outage) {
  const during = r.requestsPerSecond.slice(60, 120).reduce((a, b) => a + b, 0);
  const cleared = r.requestsPerSecond.findIndex((x, i) => i > 120 && x < 0.99 * OUTAGE.capacity);
  console.log(`  ${r.retryPolicy.padEnd(30)} calls to the failing provider ${during.toLocaleString('en-US').padStart(8)}, lost ${String(r.lost).padStart(5)}, backlog cleared at ${cleared} s, normal 99th percentile ${q(r.latency.normal, 0.99).toFixed(1)} s`);
}
assert.ok((outage[3] as typeof outage[0]).lost === 0);
assert.ok((outage[0] as typeof outage[0]).lost > (outage[2] as typeof outage[0]).lost);
console.log('\nall checks passed');
