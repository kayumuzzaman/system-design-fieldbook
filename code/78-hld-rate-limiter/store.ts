// A shared counter store in the style of Redis, simulated: one thread that runs one command at a time,
// reached over a network that takes a random fraction of a millisecond each way.
import type { Sim } from "./sim.ts";
import type { Rng } from "./rng.ts";

export interface StoreOptions {
  readonly oneWayMinMs: number; // network delay, each way
  readonly oneWayMaxMs: number;
  readonly commandMs: number; // time the store's one thread spends on GET, SET or INCRBY
  readonly scriptMs: number; // time it spends on a short script
}
export const DATA_CENTER: StoreOptions = { oneWayMinMs: 0.2, oneWayMaxMs: 0.6, commandMs: 0.01, scriptMs: 0.02 };

export class CounterStore {
  up = true; // when false, commands are lost and no reply ever comes
  commands = 0;
  private busyUntil = 0;
  private readonly data = new Map<string, unknown>();
  private readonly sim: Sim;
  private readonly rng: Rng;
  private readonly options: StoreOptions;

  constructor(sim: Sim, rng: Rng, options: StoreOptions = DATA_CENTER) {
    this.sim = sim;
    this.rng = rng;
    this.options = options;
  }

  get<S>(key: string, reply: (state: S | undefined) => void): void {
    this.send(this.options.commandMs, () => this.data.get(key) as S | undefined, reply);
  }
  set<S>(key: string, state: S, reply: () => void): void {
    this.send(this.options.commandMs, () => void this.data.set(key, state), reply);
  }
  incrBy(key: string, n: number, reply: (total: number) => void): void {
    this.send(this.options.commandMs, () => {
      const total = ((this.data.get(key) as number | undefined) ?? 0) + n;
      this.data.set(key, total);
      return total;
    }, reply);
  }
  // A script: read the state, compute, write the result, with no other command in between.
  // `now` is the store's own clock, as a script reads it with Redis's TIME command.
  eval<S, R>(key: string, script: (state: S | undefined, now: number) => { next: S; result: R }, reply: (result: R) => void): void {
    this.send(this.options.scriptMs, () => {
      const { next, result } = script(this.data.get(key) as S | undefined, this.sim.now);
      this.data.set(key, next);
      return result;
    }, reply);
  }

  private oneWay(): number {
    const { oneWayMinMs: lo, oneWayMaxMs: hi } = this.options;
    return lo + (hi - lo) * this.rng.float();
  }
  private send<R>(serviceMs: number, apply: () => R, reply: (result: R) => void): void {
    this.sim.after(this.oneWay(), () => {
      if (!this.up) return; // lost
      this.commands++;
      const start = Math.max(this.sim.now, this.busyUntil);
      this.busyUntil = start + serviceMs;
      this.sim.at(this.busyUntil, () => {
        const result = apply();
        this.sim.after(this.oneWay(), () => reply(result));
      });
    });
  }
}
