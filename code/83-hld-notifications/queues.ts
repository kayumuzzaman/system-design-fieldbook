import { Rng } from './rng.ts';

// The sending tier in time steps of a tenth of a second: notifications wait in queues, a pool of
// workers sends a fixed number per step to a provider, and failed sends come back for another try.
export type Priority = 'critical' | 'normal' | 'bulk';
export type QueuePolicy = 'one queue' | 'a queue per priority';
export type RetryPolicy = 'retry at once' | 'retry after 1 s' | 'backoff with jitter' | 'backoff and a circuit breaker';

export type TierConfig = {
  readonly step: number;            // seconds per step
  readonly capacity: number;        // sends a second the workers can make
  readonly arrivals: number;        // notifications a second, outside campaigns
  readonly criticalShare: number;   // share of arrivals that are critical (codes, security alerts)
  readonly seconds: number;         // arrivals stop after this
  readonly campaign: { readonly at: number; readonly size: number } | null;
  readonly outage: { readonly from: number; readonly to: number } | null;  // the provider fails every request
  readonly maxAttempts: number;
  readonly backoffBase: number;     // seconds
  readonly backoffCap: number;
  readonly breakerOpenFor: number;  // seconds without calls once the breaker opens
  readonly seed: number;
};

export const CAMPAIGN: TierConfig = {
  step: 0.1, capacity: 5_000, arrivals: 2_000, criticalShare: 0.05, seconds: 600,
  campaign: { at: 30, size: 2_000_000 }, outage: null, maxAttempts: 10, backoffBase: 1, backoffCap: 30, breakerOpenFor: 5, seed: 83,
};
export const OUTAGE: TierConfig = { ...CAMPAIGN, seconds: 300, campaign: null, outage: { from: 60, to: 120 } };

// A first-in, first-out queue of notifications: when each was created, its priority, its attempts so far.
class Fifo {
  private created: number[] = [];
  private pri: Priority[] = [];
  private tries: number[] = [];
  private head = 0;
  get size(): number { return this.created.length - this.head; }
  push(created: number, p: Priority, tries: number): void {
    this.created.push(created); this.pri.push(p); this.tries.push(tries);
    if (this.head > 100_000 && this.head * 2 > this.created.length) {   // drop what has been taken
      this.created = this.created.slice(this.head); this.pri = this.pri.slice(this.head); this.tries = this.tries.slice(this.head); this.head = 0;
    }
  }
  shift(): [number, Priority, number] {
    const i = this.head++;
    return [this.created[i] as number, this.pri[i] as Priority, this.tries[i] as number];
  }
}

export type TierResult = {
  readonly queuePolicy: QueuePolicy;
  readonly retryPolicy: RetryPolicy;
  readonly delivered: Record<Priority, number>;
  readonly lost: number;                          // attempts used up
  readonly latency: Record<Priority, number[]>;   // seconds from creation to an accepted send
  readonly requestsPerSecond: number[];           // calls to the provider in each second
  readonly backlog: number[];                     // notifications waiting or due for a retry, at each whole second
  readonly worstCriticalBySecond: number[];       // longest wait of a critical notification created in each second
  readonly drainedAt: number;                     // when the last notification was sent
};

export function runTier(cfg: TierConfig, queuePolicy: QueuePolicy, retryPolicy: RetryPolicy): TierResult {
  const rng = new Rng(cfg.seed);
  const order: Priority[] = ['critical', 'normal', 'bulk'];
  const queues = new Map<Priority, Fifo>(order.map((p) => [p, new Fifo()]));
  const shared = new Fifo();
  const queueFor = (p: Priority) => (queuePolicy === 'one queue' ? shared : (queues.get(p) as Fifo));
  const later = new Map<number, [number, Priority, number][]>();   // step -> retries due then
  const delivered: Record<Priority, number> = { critical: 0, normal: 0, bulk: 0 };
  const latency: Record<Priority, number[]> = { critical: [], normal: [], bulk: [] };
  const requests: number[] = [], backlog: number[] = [], worstCritical: number[] = [];
  let lost = 0, drainedAt = 0, pending = 0;
  const perStep = cfg.capacity * cfg.step;
  let credit = 0;
  // The circuit breaker: opens when most calls in the last second failed, stays open for a while,
  // then lets one probe through; a success closes it (resilience-patterns has the full pattern).
  const breaker = retryPolicy === 'backoff and a circuit breaker';
  let openUntil = -1, windowCalls = 0, windowFails = 0, windowSec = 0;
  for (let k = 0; ; k++) {
    const t = k * cfg.step;
    // New notifications.
    if (t < cfg.seconds) {
      const n = poisson(rng, cfg.arrivals * cfg.step);
      for (let i = 0; i < n; i++) {
        const p: Priority = rng.next() < cfg.criticalShare ? 'critical' : 'normal';
        queueFor(p).push(t, p, 0); pending++;
      }
    }
    if (cfg.campaign && Math.abs(t - cfg.campaign.at) < cfg.step / 2) {
      for (let i = 0; i < cfg.campaign.size; i++) queueFor('bulk').push(t, 'bulk', 0);
      pending += cfg.campaign.size;
    }
    // Retries that are due.
    for (const [created, p, tries] of later.get(k) ?? []) queueFor(p).push(created, p, tries);
    later.delete(k);
    // Send.
    credit += perStep;
    const down = cfg.outage !== null && t >= cfg.outage.from && t < cfg.outage.to;
    const sec = Math.floor(t);
    if (Math.abs(t - sec) < cfg.step / 2) backlog[sec] = pending;
    if (sec !== windowSec) { windowSec = sec; windowCalls = 0; windowFails = 0; }
    let probes = breaker && openUntil >= 0 && t >= openUntil ? 1 : Infinity;   // half open: one call
    if (breaker && t < openUntil) credit = 0;                                   // open: no calls at all
    while (credit >= 1 && probes > 0) {
      const q = queuePolicy === 'one queue' ? shared : order.map((p) => queues.get(p) as Fifo).find((x) => x.size > 0);
      if (!q || q.size === 0) { credit = Math.min(credit, perStep); break; }
      credit--;
      const [created, p, tries] = q.shift();
      requests[sec] = (requests[sec] ?? 0) + 1;
      probes--;
      windowCalls++;
      if (!down) {
        if (breaker) openUntil = -1;                                            // a success closes it
        delivered[p]++; pending--;
        latency[p].push(t - created);
        if (p === 'critical') { const c = Math.floor(created); worstCritical[c] = Math.max(worstCritical[c] ?? 0, t - created); }
        drainedAt = t;
        continue;
      }
      windowFails++;
      if (breaker && (openUntil >= 0 || (windowCalls >= 100 && windowFails * 2 > windowCalls))) openUntil = t + cfg.breakerOpenFor;
      const attempt = tries + 1;
      if (attempt >= cfg.maxAttempts) { lost++; pending--; continue; }
      if (retryPolicy === 'retry at once') { q.push(created, p, attempt); continue; }
      const wait = retryPolicy === 'retry after 1 s' ? 1 : rng.next() * Math.min(cfg.backoffCap, cfg.backoffBase * 2 ** (attempt - 1));
      const due = k + Math.max(1, Math.round(wait / cfg.step));
      const list = later.get(due) ?? [];
      list.push([created, p, attempt]);
      later.set(due, list);
    }
    if (t >= cfg.seconds && pending === 0) break;
  }
  return { queuePolicy, retryPolicy, delivered, lost, latency, requestsPerSecond: Array.from(requests, (x) => x ?? 0), backlog: Array.from(backlog, (x) => x ?? 0),
    worstCriticalBySecond: Array.from(worstCritical, (x) => x ?? 0), drainedAt };
}

// A Poisson-distributed count with mean m (Knuth's method for small m, a normal approximation above).
function poisson(rng: Rng, m: number): number {
  if (m > 50) return Math.max(0, Math.round(m + Math.sqrt(m) * rng.normal()));
  const limit = Math.exp(-m);
  let k = 0, p = rng.next();
  while (p > limit) { k++; p *= rng.next(); }
  return k;
}
