// The ways a gateway server can decide whether to let a request through, with the counts kept
// in its own memory, in a shared store, or in both.
import type { Algorithm } from "./algorithms.ts";
import { fixedWindow } from "./algorithms.ts";
import type { Sim } from "./sim.ts";
import type { CounterStore } from "./store.ts";

export interface Outcome {
  allowed: boolean;
  ms: number; // time the decision took
  by: "store" | "local" | "fail open" | "fail closed";
}
export interface Limiter {
  handle(key: string, done: (outcome: Outcome) => void): void;
}

// 1. Read, decide, write: two round trips, and room for other servers to read the same old state in between.
export class ReadThenWrite<S> implements Limiter {
  private readonly sim: Sim;
  private readonly store: CounterStore;
  private readonly algorithm: Algorithm<S>;
  constructor(sim: Sim, store: CounterStore, algorithm: Algorithm<S>) {
    this.sim = sim;
    this.store = store;
    this.algorithm = algorithm;
  }
  handle(key: string, done: (outcome: Outcome) => void): void {
    const started = this.sim.now;
    this.store.get<S>(key, (state) => {
      const { decision, next } = this.algorithm.decide(state ?? this.algorithm.start(this.sim.now), this.sim.now, 1);
      this.store.set(key, next, () => done({ allowed: decision.allowed, ms: this.sim.now - started, by: "store" }));
    });
  }
}

// 2. One script that reads, decides and writes inside the store, using the clock of the store.
export class AtomicScript<S> implements Limiter {
  private readonly sim: Sim;
  private readonly store: CounterStore;
  private readonly algorithm: Algorithm<S>;
  constructor(sim: Sim, store: CounterStore, algorithm: Algorithm<S>) {
    this.sim = sim;
    this.store = store;
    this.algorithm = algorithm;
  }
  handle(key: string, done: (outcome: Outcome) => void): void {
    const started = this.sim.now;
    const algorithm = this.algorithm;
    this.store.eval<S, boolean>(
      key,
      (state, now) => {
        const { decision, next } = algorithm.decide(state ?? algorithm.start(now), now, 1);
        return { next, result: decision.allowed };
      },
      (allowed) => done({ allowed, ms: this.sim.now - started, by: "store" }),
    );
  }
}

// 3. Local only: each of n servers enforces its share of the limit, and nothing is shared.
export class LocalShare<S> implements Limiter {
  private readonly sim: Sim;
  private readonly algorithm: Algorithm<S>;
  private readonly states = new Map<string, S>();
  constructor(sim: Sim, algorithm: Algorithm<S>) {
    this.sim = sim;
    this.algorithm = algorithm;
  }
  handle(key: string, done: (outcome: Outcome) => void): void {
    done({ allowed: this.decide(key), ms: 0, by: "local" });
  }
  decide(key: string): boolean {
    const now = this.sim.now;
    const { decision, next } = this.algorithm.decide(this.states.get(key) ?? this.algorithm.start(now), now, 1);
    this.states.set(key, next);
    return decision.allowed;
  }
}

// 4. Count locally, and every `syncMs` add the local count to the shared one and read the total back.
// Between syncs a server decides on the last total it saw plus what it has let through since:
// one store command for each key and interval instead of one for each request, at the price of
// trusting a total that is up to one interval old.
interface Window {
  window: number;
  local: number; // let through here, not yet sent
  sending: number; // sent, not yet confirmed
  total: number; // the shared count at the last reply, which includes everything this server sent
}
export class SyncedWindow implements Limiter {
  private readonly sim: Sim;
  private readonly store: CounterStore;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, Window>();

  constructor(sim: Sim, store: CounterStore, limit: number, windowMs: number, syncMs: number, phaseMs: number) {
    this.sim = sim;
    this.store = store;
    this.limit = limit;
    this.windowMs = windowMs;
    const tick = (): void => {
      this.sync();
      sim.after(syncMs, tick);
    };
    sim.at(phaseMs, tick);
  }

  handle(key: string, done: (outcome: Outcome) => void): void {
    const w = this.current(key);
    const allowed = w.total + w.sending + w.local < this.limit;
    if (allowed) w.local++;
    done({ allowed, ms: 0, by: "local" });
  }

  private current(key: string): Window {
    const window = Math.floor(this.sim.now / this.windowMs);
    let w = this.windows.get(key);
    if (!w || w.window !== window) {
      w = { window, local: 0, sending: 0, total: 0 };
      this.windows.set(key, w);
    }
    return w;
  }

  private sync(): void {
    for (const [key, w] of this.windows) {
      if (w.window !== Math.floor(this.sim.now / this.windowMs)) continue; // a finished window needs nothing more
      const n = w.local;
      w.local = 0;
      w.sending += n;
      this.store.incrBy(`${key}@${w.window}`, n, (total) => {
        w.sending -= n;
        w.total = Math.max(w.total, total);
      });
    }
  }
}

// The same fixed window, counted in the store on every request: the exact version of SyncedWindow.
export const atomicWindow = (sim: Sim, store: CounterStore, limit: number, windowMs: number): Limiter =>
  new AtomicScript(sim, store, fixedWindow(limit, windowMs));

// 5. What to do when the store does not answer in time.
export type Policy = "fail open" | "fail closed" | "local share";
export interface BreakerOptions {
  readonly failures: number; // consecutive timeouts that open the breaker
  readonly openMs: number; // how long to skip the store before trying it again
}
export class Guarded implements Limiter {
  private readonly sim: Sim;
  private readonly inner: Limiter;
  private readonly fallback: { decide(key: string): boolean };
  private readonly policy: Policy;
  private readonly timeoutMs: number;
  private readonly breaker: BreakerOptions | null;
  private failures = 0;
  private openUntil = -1;

  constructor(sim: Sim, inner: Limiter, fallback: { decide(key: string): boolean }, policy: Policy, timeoutMs: number, breaker: BreakerOptions | null) {
    this.sim = sim;
    this.inner = inner;
    this.fallback = fallback;
    this.policy = policy;
    this.timeoutMs = timeoutMs;
    this.breaker = breaker;
  }

  handle(key: string, done: (outcome: Outcome) => void): void {
    const started = this.sim.now;
    if (this.breaker && this.sim.now < this.openUntil) return done(this.degrade(key, started));
    let finished = false;
    this.sim.after(this.timeoutMs, () => {
      if (finished) return;
      finished = true;
      this.failures++;
      if (this.breaker && this.failures >= this.breaker.failures) this.openUntil = this.sim.now + this.breaker.openMs;
      done(this.degrade(key, started));
    });
    this.inner.handle(key, (outcome) => {
      if (finished) return; // the answer came after the timeout: too late to use
      finished = true;
      this.failures = 0;
      done(outcome);
    });
  }

  private degrade(key: string, started: number): Outcome {
    const ms = this.sim.now - started;
    if (this.policy === "fail open") return { allowed: true, ms, by: "fail open" };
    if (this.policy === "fail closed") return { allowed: false, ms, by: "fail closed" };
    return { allowed: this.fallback.decide(key), ms, by: "local" };
  }
}
