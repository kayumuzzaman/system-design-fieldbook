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

// GCRA, the leaky bucket as a meter. It stores one number: the time at which the bucket would next be empty.
export const gcra = (limit: number, windowMs: number): Algorithm<{ emptyAt: number }> => {
  const interval = windowMs / limit; // the time one request takes to leak away
  return {
    name: "GCRA", limit, windowMs,
    start: (now) => ({ emptyAt: now }),
    decide(state, now, cost) {
      const emptyAt = Math.max(state.emptyAt, now) + cost * interval;
      if (emptyAt - now <= windowMs) return { decision: { allowed: true, remaining: Math.floor((windowMs - (emptyAt - now)) / interval), retryAfterMs: 0, resetMs: Math.ceil(emptyAt - now) }, next: { emptyAt } };
      return { decision: { allowed: false, remaining: Math.max(0, Math.floor((windowMs - (state.emptyAt - now)) / interval)), retryAfterMs: Math.ceil(emptyAt - now - windowMs), resetMs: Math.ceil(Math.max(0, state.emptyAt - now)) }, next: state };
    },
  };
};

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

// Exact, and the most expensive: one timestamp for every request in the last window.
export const slidingLog = (limit: number, windowMs: number): Algorithm<{ times: number[] }> => ({
  name: "sliding log", limit, windowMs,
  start: () => ({ times: [] }),
  decide(state, now, cost) {
    const times = state.times.filter((t) => t > now - windowMs);
    if (times.length + cost <= limit) {
      const next = [...times]; for (let i = 0; i < cost; i += 1) next.push(now);
      return { decision: { allowed: true, remaining: limit - next.length, retryAfterMs: 0, resetMs: windowMs }, next: { times: next } };
    }
    const freeAt = (times[times.length + cost - limit - 1] as number) + windowMs; // when enough old entries will have left
    const emptyAt = (times[times.length - 1] as number) + windowMs;                // when the newest has left too
    return { decision: { allowed: false, remaining: limit - times.length, retryAfterMs: Math.max(1, freeAt - now), resetMs: emptyAt - now }, next: { times } };
  },
});

// Two counters, and an estimate that assumes last window's requests were spread evenly.
export const slidingCounter = (limit: number, windowMs: number): Algorithm<{ start: number; current: number; previous: number }> => ({
  name: "sliding counter", limit, windowMs,
  start: (now) => ({ start: now - (now % windowMs), current: 0, previous: 0 }),
  decide(state, now, cost) {
    const start = now - (now % windowMs);
    const gap = (start - state.start) / windowMs;
    const previous = gap === 0 ? state.previous : gap === 1 ? state.current : 0;
    const current = gap === 0 ? state.current : 0;
    const estimate = previous * ((windowMs - (now - start)) / windowMs) + current;
    // Both counts have faded to nothing at the end of the next window, or of this one if nothing counts in it.
    const reset = (counted: number) => (counted > 0 ? start + 2 * windowMs - now : previous > 0 ? start + windowMs - now : 0);
    if (estimate + cost <= limit) return { decision: { allowed: true, remaining: Math.floor(limit - estimate - cost), retryAfterMs: 0, resetMs: reset(current + cost) }, next: { start, current: current + cost, previous } };
    return { decision: { allowed: false, remaining: Math.max(0, Math.floor(limit - estimate)), retryAfterMs: Math.max(1, Math.ceil(start + windowMs - now)), resetMs: reset(current) }, next: { start, current, previous } };
  },
});
