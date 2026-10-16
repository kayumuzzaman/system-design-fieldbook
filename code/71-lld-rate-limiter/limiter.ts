import type { Algorithm, Decision } from "./algorithms.ts";
import { LruCache } from "./lru.ts";

// One algorithm, a state for each key, and a bound on how many keys are remembered.
export class KeyedLimiter<S> {
  readonly algorithm: Algorithm<S>;
  private readonly states: LruCache<string, S>;
  private latest = -Infinity; // the largest time seen so far

  constructor(algorithm: Algorithm<S>, maxKeys: number) {
    this.algorithm = algorithm;
    this.states = new LruCache(maxKeys); // the least recently active key is forgotten first
  }

  // Works out the decision and the state that would follow, without storing anything.
  check(key: string, now: number, cost = 1): { decision: Decision; commit: () => void } {
    if (!Number.isInteger(cost) || cost < 1 || cost > this.algorithm.limit) {
      throw new RangeError(`cost ${cost} can never be allowed by a limit of ${this.algorithm.limit}`);
    }
    now = Math.max(now, this.latest); // a clock that steps back must not hand out a fresh allowance
    this.latest = now;
    const state = this.states.get(key) ?? this.algorithm.start(now);
    const { decision, next } = this.algorithm.decide(state, now, cost);
    return { decision, commit: () => this.states.put(key, next) };
  }

  tryAcquire(key: string, now: number, cost = 1): Decision {
    const { decision, commit } = this.check(key, now, cost);
    commit();
    return decision;
  }

  get keys(): number {
    return this.states.size;
  }
}

// Several limits that must all agree: for example one for each user and one for the whole service.
// Nothing is consumed unless every limit allows the request.
export interface Limit {
  readonly name: string;
  readonly limiter: KeyedLimiter<unknown>;
  readonly keyOf: (request: { user: string; route: string }) => string;
}
export function allOf(limits: readonly Limit[]) {
  return (request: { user: string; route: string }, now: number): { decision: Decision; blockedBy: string | null } => {
    const checks = limits.map((limit) => ({ limit, ...limit.limiter.check(limit.keyOf(request), now) }));
    const refused = checks.filter((c) => !c.decision.allowed);
    if (refused.length === 0) {
      for (const c of checks) c.commit();
      const closest = checks.reduce((a, b) => (b.decision.remaining < a.decision.remaining ? b : a)); // the limit nearest to running out
      return { decision: closest.decision, blockedBy: null };
    }
    const worst = refused.reduce((a, b) => (b.decision.retryAfterMs > a.decision.retryAfterMs ? b : a));
    return { decision: worst.decision, blockedBy: worst.limit.name };
  };
}

// The version that is easy to write and wrong: each limit takes its share as it is checked.
export function eachInTurn(limits: readonly Limit[]) {
  return (request: { user: string; route: string }, now: number): { decision: Decision; blockedBy: string | null } => {
    for (const limit of limits) {
      const decision = limit.limiter.tryAcquire(limit.keyOf(request), now);
      if (!decision.allowed) return { decision, blockedBy: limit.name };
    }
    return { decision: { allowed: true, remaining: 0, retryAfterMs: 0, resetMs: 0 }, blockedBy: null };
  };
}
