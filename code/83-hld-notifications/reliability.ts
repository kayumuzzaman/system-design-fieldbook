import { Rng } from './rng.ts';

// Where duplicate and lost notifications come from, one notification at a time.
// Every step on the way can fail in a way that hides whether it worked.
export type Faults = {
  readonly producerRetry: number; // the producer's call reached us, its answer was lost, so it calls again
  readonly redelivery: number;    // the queue hands the same message to a second worker
  readonly transient: number;     // the provider answers "failed": nothing was sent
  readonly timeout: number;       // no answer from the provider
  readonly timeoutSent: number;   // share of timeouts in which the provider did send
  readonly crash: number;         // the worker dies after the provider accepted, before recording it
  readonly maxAttempts: number;
};

export const FAULTS: Faults = { producerRetry: 0.02, redelivery: 0.005, transient: 0.03, timeout: 0.01, timeoutSent: 0.5, crash: 0.0005, maxAttempts: 5 };

export type Strategy = 'send once' | 'retry, no key' | 'retry, idempotency key' | 'key, no retry when unsure' | 'key, retry with collapse id';
export const STRATEGIES: Strategy[] = ['send once', 'retry, no key', 'retry, idempotency key', 'key, no retry when unsure', 'key, retry with collapse id'];

// What the dedup store remembers about a key. "sending" is written before calling the provider and
// "sent" after it accepted, so a worker that finds "sending" knows only that a send may have happened.
export type KeyState = 'sending' | 'sent';

export class DedupStore {
  private readonly keys = new Map<string, KeyState>();
  // Atomic "set if absent", as in Redis SET NX or a conditional write: true if this caller claimed the key.
  claim(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.set(key, 'sending');
    return true;
  }
  state(key: string): KeyState | undefined {
    return this.keys.get(key);
  }
  markSent(key: string): void {
    this.keys.set(key, 'sent');
  }
}

export type ReliabilityResult = {
  readonly strategy: Strategy;
  readonly notifications: number;
  readonly lost: number;            // never reached the user
  readonly duplicates: number;      // extra copies the user saw
  readonly causes: { readonly upstream: number; readonly timeout: number; readonly crash: number };  // where the extra copies came from
  readonly providerCalls: number;
};

// One notification through the pipeline: copies from upstream, a worker for each copy,
// attempts against the provider, and a possible crash between the provider and the record.
export function reliability(f: Faults, strategy: Strategy, notifications: number, seed: number): ReliabilityResult {
  const rng = new Rng(seed);
  const useKey = strategy !== 'send once' && strategy !== 'retry, no key';
  const retries = strategy !== 'send once';
  const retryWhenUnsure = strategy !== 'key, no retry when unsure';
  const collapse = strategy === 'key, retry with collapse id';
  const store = new DedupStore();
  let lost = 0, duplicates = 0, calls = 0;
  const causes = { upstream: 0, timeout: 0, crash: 0 };
  for (let n = 0; n < notifications; n++) {
    const key = `n${n}`;
    // Copies that reach the workers: the original, a producer's retry, a queue's redelivery.
    let copies = 1;
    if (rng.next() < f.producerRetry) copies++;
    for (let c = copies; c > 0; c--) if (rng.next() < f.redelivery) copies++;
    const upstreamCopies = copies;
    // Each delivery is labeled with why its attempt happened, to say where an extra copy came from.
    const deliveries: ('first' | 'upstream' | 'timeout' | 'crash')[] = [];
    for (let c = 0; c < copies; c++) {
      if (useKey && !store.claim(key)) {
        // Someone has handled or is handling this key. "sent" is final; "sending" means a worker
        // died or is unsure, and the strategy decides whether to send again.
        if (store.state(key) === 'sent' || !retryWhenUnsure) continue;
      }
      let reason: 'first' | 'upstream' | 'timeout' | 'crash' = c === 0 ? 'first' : c < upstreamCopies ? 'upstream' : 'crash';
      for (let attempt = 1; attempt <= (retries ? f.maxAttempts : 1); attempt++) {
        calls++;
        const r = rng.next();
        if (r < f.transient) continue;                          // failed for certain: try again
        if (r < f.transient + f.timeout) {                      // no answer
          if (rng.next() < f.timeoutSent) deliveries.push(reason);
          if (!retryWhenUnsure) break;
          reason = 'timeout';                                   // what follows is a retry made while unsure
          continue;
        }
        deliveries.push(reason);                                // accepted
        if (rng.next() < f.crash) { copies++; break; }          // died before recording: the queue redelivers
        if (useKey) store.markSent(key);
        break;
      }
    }
    if (deliveries.length === 0) lost++;
    else if (!collapse) {                                       // with a collapse id the device shows one
      duplicates += deliveries.length - 1;
      for (const d of deliveries.slice(1)) if (d !== 'first') causes[d]++;
    }
  }
  return { strategy, notifications, lost, duplicates, causes, providerCalls: calls };
}
