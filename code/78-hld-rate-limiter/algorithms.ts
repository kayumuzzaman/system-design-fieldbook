// Copied from chapter 71 (lld-rate-limiter): the algorithms as pure functions of their state.
// Each algorithm is a pair of pure functions: the state a new client starts with, and a decision that returns
// the next state. Nothing here reads a clock or stores anything. Times are milliseconds.
export interface Decision {
  allowed: boolean;
  remaining: number;    // requests that could still be made now
  retryAfterMs: number; // 0 if allowed; otherwise the wait before one request would be allowed
  resetMs: number;      // the wait, if nothing more arrives, until the whole allowance is back
}
export interface Algorithm<S> {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  start(now: number): S;
  decide(state: S, now: number, cost: number): { decision: Decision; next: S };
}

// Token bucket, counted in integers: one token is `windowMs` units of credit, and `limit` units arrive each millisecond.
export const tokenBucket = (limit: number, windowMs: number): Algorithm<{ credit: number; at: number }> => ({
  name: "token bucket", limit, windowMs,
  start: (now) => ({ credit: limit * windowMs, at: now }),
  decide(state, now, cost) {
    const credit = Math.min(limit * windowMs, state.credit + (now - state.at) * limit);
    const need = cost * windowMs;
    const full = (left: number) => Math.ceil((limit * windowMs - left) / limit);
    if (credit >= need) return { decision: { allowed: true, remaining: Math.floor((credit - need) / windowMs), retryAfterMs: 0, resetMs: full(credit - need) }, next: { credit: credit - need, at: now } };
    return { decision: { allowed: false, remaining: Math.floor(credit / windowMs), retryAfterMs: Math.ceil((need - credit) / limit), resetMs: full(credit) }, next: { credit, at: now } };
  },
});

export const fixedWindow = (limit: number, windowMs: number): Algorithm<{ start: number; count: number }> => ({
  name: "fixed window", limit, windowMs,
  start: (now) => ({ start: now - (now % windowMs), count: 0 }),
  decide(state, now, cost) {
    const start = now - (now % windowMs);
    const count = start === state.start ? state.count : 0;
    if (count + cost <= limit) return { decision: { allowed: true, remaining: limit - count - cost, retryAfterMs: 0, resetMs: start + windowMs - now }, next: { start, count: count + cost } };
    return { decision: { allowed: false, remaining: limit - count, retryAfterMs: start + windowMs - now, resetMs: start + windowMs - now }, next: { start, count } };
  },
});
