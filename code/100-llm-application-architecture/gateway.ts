// A gateway in front of several model providers: it tries them in order of preference, falls back when one
// fails in a way that another might not, and stops calling one that keeps failing (a circuit breaker).
export type Reply = { ok: true; text: string } | { ok: false; status: number };
export interface Provider { readonly name: string; call(prompt: string, now: number): Reply }

// A provider whose behavior is scripted: it answers, except during an outage when it returns `status`.
export class ScriptedProvider implements Provider {
  readonly name: string;
  calls = 0;
  private readonly outages: { from: number; to: number; status: number }[];
  constructor(name: string, outages: { from: number; to: number; status: number }[] = []) {
    this.name = name;
    this.outages = outages;
  }
  call(prompt: string, now: number): Reply {
    this.calls += 1;
    const out = this.outages.find((o) => now >= o.from && now < o.to);
    return out ? { ok: false, status: out.status } : { ok: true, text: `${this.name}: answer to ${prompt}` };
  }
}

// Worth trying elsewhere: rate limited (429), the provider's own failures (500 and up, including the 529
// some providers use for "overloaded"). A 400 means the request itself is wrong, and every provider will say so.
export const worthFallingBack = (status: number): boolean => status === 429 || status >= 500;

class Breaker {
  private failures = 0;
  private openUntil = -Infinity;
  private readonly threshold: number;
  private readonly coolDownMs: number;
  constructor(threshold: number, coolDownMs: number) {
    this.threshold = threshold;
    this.coolDownMs = coolDownMs;
  }
  allows(now: number): boolean { return now >= this.openUntil; } // after the cool-down, one call is let through to test
  record(ok: boolean, now: number): void {
    this.failures = ok ? 0 : this.failures + 1;
    if (this.failures >= this.threshold) this.openUntil = now + this.coolDownMs;
  }
}

export class Gateway {
  private readonly providers: readonly Provider[];
  private readonly breakers = new Map<string, Breaker>();
  constructor(providers: readonly Provider[], threshold = 3, coolDownMs = 5_000) {
    this.providers = providers;
    for (const p of providers) this.breakers.set(p.name, new Breaker(threshold, coolDownMs));
  }
  complete(prompt: string, now: number): { reply: Reply; servedBy?: string; tried: string[] } {
    const tried: string[] = [];
    let last: Reply = { ok: false, status: 503 };
    for (const p of this.providers) {
      const breaker = this.breakers.get(p.name) as Breaker;
      if (!breaker.allows(now)) continue;          // known to be failing: do not wait for it to fail again
      tried.push(p.name);
      last = p.call(prompt, now);
      breaker.record(last.ok || !worthFallingBack(last.status), now);
      if (last.ok) return { reply: last, servedBy: p.name, tried };
      if (!worthFallingBack(last.status)) break;
    }
    return { reply: last, tried };
  }
}
