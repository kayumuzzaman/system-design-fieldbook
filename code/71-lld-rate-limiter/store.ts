import type { Algorithm, Decision } from "./algorithms.ts";

// Limiter state kept somewhere slower than this process's memory, such as Redis. Every call waits.
export interface StateStore<S> {
  get(key: string): Promise<S | undefined>;
  set(key: string, state: S): Promise<void>;
  // Reads, changes and writes one key with nothing in between: in Redis a script, in SQL a transaction.
  update<R>(key: string, change: (state: S | undefined) => { next: S; result: R }): Promise<R>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A stand-in for a remote store: a map, with a delay on every call for the network.
export class SlowStore<S> implements StateStore<S> {
  private readonly data = new Map<string, S>();
  private readonly latencyMs: number;
  constructor(latencyMs: number) {
    this.latencyMs = latencyMs;
  }
  async get(key: string): Promise<S | undefined> {
    await sleep(this.latencyMs);
    return this.data.get(key);
  }
  async set(key: string, state: S): Promise<void> {
    await sleep(this.latencyMs);
    this.data.set(key, state);
  }
  async update<R>(key: string, change: (state: S | undefined) => { next: S; result: R }): Promise<R> {
    await sleep(this.latencyMs);
    const { next, result } = change(this.data.get(key)); // runs to completion: nothing else can interleave here
    this.data.set(key, next);
    return result;
  }
}

// Read, decide, write: three steps, with waits between them where other requests can read the same old state.
export async function racyAcquire<S>(store: StateStore<S>, algorithm: Algorithm<S>, key: string, now: number): Promise<Decision> {
  const state = (await store.get(key)) ?? algorithm.start(now);
  const { decision, next } = algorithm.decide(state, now, 1);
  await store.set(key, next);
  return decision;
}

// The same decision, made inside one atomic update.
export function atomicAcquire<S>(store: StateStore<S>, algorithm: Algorithm<S>, key: string, now: number): Promise<Decision> {
  return store.update(key, (state) => {
    const { decision, next } = algorithm.decide(state ?? algorithm.start(now), now, 1);
    return { next, result: decision };
  });
}
