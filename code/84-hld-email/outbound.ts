import { MinHeap } from './heap.ts';
import { Rng } from './rng.ts';

// Outgoing mail, simulated event by event. A pool of connections delivers messages to a thousand
// receiving domains of very different sizes. Some answer "try again later" at first (greylisting),
// a few fail at random, and the largest domain stops answering for an hour: an attempt to it holds
// a connection until a 30-second timeout.
export type OutboundPolicy = 'shared pool, retry every 30 min' | 'shared pool, backoff from 1 min' | 'per-domain limit and down list, backoff';
export const OUTBOUND_POLICIES: OutboundPolicy[] = ['shared pool, retry every 30 min', 'shared pool, backoff from 1 min', 'per-domain limit and down list, backoff'];

export type OutboundConfig = {
  readonly connections: number;      // simultaneous SMTP connections
  readonly perSecond: number;        // messages submitted per second
  readonly seconds: number;          // submissions stop after this
  readonly domains: number;          // receiving domains, sizes following Zipf's law
  readonly sendTime: number;         // seconds for one successful delivery
  readonly timeout: number;          // seconds an attempt to an unreachable server holds a connection
  readonly temporary: number;        // share of attempts answered "try again later" for no lasting reason
  readonly permanent: number;        // share answered "no such user": bounced at once
  readonly greylistShare: number;    // share of domains that refuse a new sender until it retries after `greylistFor`
  readonly greylistFor: number;
  readonly outage: { readonly from: number; readonly to: number };   // the largest domain is unreachable
  readonly perDomain: number;        // connection limit per domain, for the limited policy
  readonly downAfter: number;        // timeouts in a row before a domain goes on the down list
  readonly downFor: number;          // seconds on the down list before one message is tried as a probe
  readonly seed: number;
};

export const OUTBOUND: OutboundConfig = {
  connections: 200, perSecond: 50, seconds: 7_200, domains: 1_000, sendTime: 0.5, timeout: 30, temporary: 0.02, permanent: 0.01,
  greylistShare: 0.1, greylistFor: 300, outage: { from: 600, to: 4_200 }, perDomain: 20, downAfter: 5, downFor: 300, seed: 84,
};

type Msg = { readonly id: number; readonly domain: number; readonly submitted: number; attempts: number };
type Ev = { t: number; n: number; kind: 'submit' | 'done' | 'due' | 'probe'; msg?: Msg; domain?: number; ok?: 'sent' | 'later' | 'bounce' | 'timeout' };

export type OutboundResult = {
  readonly policy: OutboundPolicy;
  readonly messages: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly attempts: number;
  readonly timeoutSeconds: number;               // connection time spent waiting on the unreachable domain
  readonly delays: { readonly others: number[]; readonly greylisted: number[]; readonly downDomain: number[] };  // seconds, submit to delivery
  readonly othersDuringOutage: number[];         // delays of mail to other domains submitted during the outage
  readonly afterRecovery: number[];              // for mail to the unreachable domain submitted during the outage: seconds from recovery to delivery
  readonly medianOtherByMinute: number[];        // median delay of mail to other domains (not greylisting), by minute of submission
};

export function runOutbound(cfg: OutboundConfig, policy: OutboundPolicy): OutboundResult {
  const rng = new Rng(cfg.seed), luck = new Rng(cfg.seed + 7);
  // Domain sizes: domain d gets mail in proportion to 1/(d+1). Domain 0 is the largest.
  const weights = Array.from({ length: cfg.domains }, (_, d) => 1 / (d + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative: number[] = [];
  weights.reduce((acc, w) => { cumulative.push(acc + w / total); return acc + w / total; }, 0);
  const pickDomain = () => { const r = rng.next(); let lo = 0, hi = cfg.domains - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if ((cumulative[mid] as number) < r) lo = mid + 1; else hi = mid; } return lo; };
  const greylists = Array.from({ length: cfg.domains }, (_, d) => d > 0 && rng.next() < cfg.greylistShare);
  const limited = policy === 'per-domain limit and down list, backoff';
  const retryDelay = (attempts: number) => policy === 'shared pool, retry every 30 min' ? 1_800 : Math.min(7_200, 60 * 2 ** (attempts - 1)) * (0.5 + luck.next() / 2);

  const q = new MinHeap<Ev>((a, b) => a.t < b.t || (a.t === b.t && a.n < b.n));
  let n = 0;
  const at = (t: number, e: Omit<Ev, 't' | 'n'>) => q.push({ t, n: n++, ...e });
  for (let t = rng.exponential(cfg.perSecond), id = 0; t < cfg.seconds; t += rng.exponential(cfg.perSecond)) at(t, { kind: 'submit', msg: { id: id++, domain: pickDomain(), submitted: t, attempts: 0 } });

  const ready: Msg[] = []; let head = 0;                   // messages ready for an attempt, in order
  const waiting = new Map<number, Msg[]>();               // per domain, held back by its connection limit
  const active = new Array<number>(cfg.domains).fill(0);
  const timeoutsInRow = new Array<number>(cfg.domains).fill(0);
  // The down list, as RFC 5321 suggests: a domain that keeps timing out is marked down, its messages are
  // parked instead of each being tried, and one message is tried as a probe every `downFor` seconds.
  // When the probe gets through, everything parked is released at once.
  const down = new Array<boolean>(cfg.domains).fill(false);
  const probing = new Array<number>(cfg.domains).fill(-1);  // id of the message in flight as a probe
  const parked = new Map<number, Msg[]>();
  const firstTry = new Map<number, number>();             // message -> time of its first attempt (greylisting)
  let free = cfg.connections, now = 0, attempts = 0, timeoutSeconds = 0, delivered = 0, bounced = 0, messages = 0;
  const delays = { others: [] as number[], greylisted: [] as number[], downDomain: [] as number[] };
  const during: number[] = [];
  const byMinute: number[][] = [];
  const afterRecovery: number[] = [];

  const start = (m: Msg) => {
    free--; active[m.domain]++; attempts++; m.attempts++;
    if (!firstTry.has(m.id)) firstTry.set(m.id, now);
    const unreachable = m.domain === 0 && now >= cfg.outage.from && now < cfg.outage.to;
    if (unreachable) { timeoutSeconds += cfg.timeout; at(now + cfg.timeout, { kind: 'done', msg: m, ok: 'timeout' }); return; }
    const r = luck.next();
    const grey = greylists[m.domain] && now - (firstTry.get(m.id) as number) < cfg.greylistFor;
    const ok = grey || r < cfg.temporary ? 'later' : r < cfg.temporary + cfg.permanent ? 'bounce' : 'sent';
    at(now + cfg.sendTime, { kind: 'done', msg: m, ok });
  };
  const dispatch = () => {
    while (free > 0 && head < ready.length) {
      const m = ready[head++] as Msg;
      if (limited && down[m.domain]) { const p = parked.get(m.domain) ?? []; p.push(m); parked.set(m.domain, p); continue; }
      if (limited && (active[m.domain] as number) >= cfg.perDomain) { const w = waiting.get(m.domain) ?? []; w.push(m); waiting.set(m.domain, w); continue; }
      start(m);
    }
    if (head > 50_000) { ready.splice(0, head); head = 0; }
  };

  while (q.size > 0) {
    const e = q.pop() as Ev;
    now = e.t;
    const m = e.msg as Msg;
    if (e.kind === 'submit') { messages++; ready.push(m); }
    else if (e.kind === 'due') ready.push(m);
    else if (e.kind === 'probe') {
      const d = e.domain as number, p = parked.get(d) ?? [];
      if (p.length && free > 0) { const probe = p.shift() as Msg; probing[d] = probe.id; start(probe); }
      else at(now + 1, { kind: 'probe', domain: d });
    } else {
      free++; active[m.domain]--;
      const wasProbe = probing[m.domain] === m.id;
      if (wasProbe) probing[m.domain] = -1;
      if (e.ok === 'timeout') {
        timeoutsInRow[m.domain]++;
        if (limited && !down[m.domain] && (timeoutsInRow[m.domain] as number) >= cfg.downAfter) { down[m.domain] = true; at(now + cfg.downFor, { kind: 'probe', domain: m.domain }); }
        if (limited && wasProbe) { (parked.get(m.domain) as Msg[]).unshift(m); at(now + cfg.downFor, { kind: 'probe', domain: m.domain }); }
      } else {
        timeoutsInRow[m.domain] = 0;
        if (limited && down[m.domain]) {            // the domain answers again: release everything parked
          down[m.domain] = false;
          for (const x of parked.get(m.domain) ?? []) ready.push(x);
          parked.delete(m.domain);
        }
      }
      if (e.ok === 'sent') {
        delivered++;
        const d = now - m.submitted;
        if (m.domain === 0) {
          delays.downDomain.push(d);
          if (m.submitted >= cfg.outage.from && m.submitted < cfg.outage.to) afterRecovery.push(now - cfg.outage.to);
        }
        else if (greylists[m.domain]) delays.greylisted.push(d);
        else {
          delays.others.push(d);
          if (m.submitted >= cfg.outage.from && m.submitted < cfg.outage.to) during.push(d);
          const minute = Math.floor(m.submitted / 60);
          (byMinute[minute] ??= []).push(d);
        }
      } else if (e.ok === 'bounce') bounced++;
      else if (!(limited && wasProbe && e.ok === 'timeout')) {
        const wait = retryDelay(m.attempts);
        at(now + wait, { kind: 'due', msg: m });
      }
      // A slot for this domain opened: let a held-back message of the same domain go first.
      const w = waiting.get(m.domain);
      if (w && w.length) ready.splice(head, 0, w.shift() as Msg);
    }
    dispatch();
  }
  return {
    policy, messages, delivered, bounced, attempts, timeoutSeconds, delays, othersDuringOutage: during,
    afterRecovery, medianOtherByMinute: Array.from(byMinute, (x) => { const a = Float64Array.from(x ?? [0]).sort(); return a[a.length >> 1] as number; }),
  };
}
