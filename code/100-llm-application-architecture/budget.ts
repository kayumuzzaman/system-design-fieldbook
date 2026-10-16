// A token budget for each user: a token bucket (as in the resilience chapter) whose unit is a model token,
// not a request. The output length is unknown until the answer is finished, so a call reserves the most it
// could use before it starts, and the unused part is returned when the real usage is known.
export class TokenBudget {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.refillPerMs = refillPerMinute / 60_000;
  }
  private bucket(user: string, now: number) {
    const b = this.buckets.get(user) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * this.refillPerMs);
    b.at = now;
    this.buckets.set(user, b);
    return b;
  }
  // Before the call: input tokens plus the largest answer allowed (max_tokens).
  reserve(user: string, tokens: number, now: number): { ok: true } | { ok: false; retryAfterMs: number } {
    const b = this.bucket(user, now);
    if (b.tokens >= tokens) {
      b.tokens -= tokens;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil((tokens - b.tokens) / this.refillPerMs) };
  }
  // After the call: give back what was reserved and not used. (Charging only here, with no reservation,
  // lets a burst of calls that start together all pass, and the bill arrives after the limit is long gone.)
  settle(user: string, reserved: number, used: number, now: number): void {
    const b = this.bucket(user, now);
    b.tokens = Math.min(this.capacity, b.tokens + reserved - used);
  }
  remaining(user: string, now: number): number { return this.bucket(user, now).tokens; }
}

export interface Prices { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number }
export interface Billed { input: number; cachedInput: number; output: number }
// The cost of one call in dollars. Cached input is billed at its own, lower price.
export function costOf(usage: Billed, price: Prices): number {
  return (usage.input * price.inputPerMillion + usage.cachedInput * price.cachedInputPerMillion + usage.output * price.outputPerMillion) / 1e6;
}
