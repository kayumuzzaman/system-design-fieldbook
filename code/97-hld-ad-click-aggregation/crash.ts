// Crashes in the middle of counting. A consumer reads the log in batches of 500 clicks, counts them
// by ad and minute, writes the counts to the store and records how far it has read (the offset).
// A crash can come between any two of its three steps. Three ways of ordering the steps:
//   commit-first       record the offset, count, write increments     (at most once)
//   write-then-commit  count, write increments, record the offset     (at least once)
//   checkpoint         count, write totals with a version; every tenth batch, save offset and state together
//                      (exactly once in effect)
import type { Click } from "./clicks.ts";
import { seeded } from "./rng.ts";

export type Strategy = "commit-first" | "write-then-commit" | "checkpoint";
const key = (c: Click) => `${c.ad}@${c.time - (c.time % 60_000)}`;

export interface CrashResult { readonly strategy: Strategy; readonly crashes: number; readonly counted: number; readonly truth: number; readonly keysWrong: number }

export function withCrashes(log: readonly Click[], strategy: Strategy, crashes: number, seed: number, batch = 500, every = 10): CrashResult {
  const random = seeded(seed);
  const batches = Math.ceil(log.length / batch);
  const plan = new Map<number, number>();            // batch number -> crash after step 1 or 2
  while (plan.size < crashes) plan.set(Math.floor(random() * batches), 1 + Math.floor(random() * 2));

  const store = new Map<string, number>();            // the results store
  const version = new Map<string, number>();          // for totals: the offset each value was written at
  let committed = 0;                                  // the offset the consumer will restart from
  let position = 0;                                   // how far this run of the consumer has read
  let saved = new Map<string, number>();              // checkpoint: the state as of `committed`
  let state = new Map<string, number>();
  let b = 0;
  while (position < log.length) {
    const from = position, to = Math.min(log.length, from + batch);
    const crashAfter = plan.get(b) ?? 0;
    plan.delete(b);                                   // each planned crash happens once
    b += 1;
    const steps: (() => void)[] = [];
    const delta = new Map<string, number>();
    const count = () => {
      for (let i = from; i < to; i += 1) {
        const k = key(log[i] as Click);
        delta.set(k, (delta.get(k) ?? 0) + 1);
        state.set(k, (state.get(k) ?? 0) + 1);
      }
    };
    const writeIncrements = () => { for (const [k, n] of delta) store.set(k, (store.get(k) ?? 0) + n); };
    const writeTotals = () => {
      for (const k of delta.keys()) {
        if ((version.get(k) ?? -1) >= to) continue;   // already written by an earlier attempt at this batch
        store.set(k, state.get(k) as number); version.set(k, to);
      }
    };
    if (strategy === "commit-first") steps.push(() => { committed = to; }, count, writeIncrements);
    else if (strategy === "write-then-commit") steps.push(count, writeIncrements, () => { committed = to; });
    else steps.push(count, writeTotals, () => { if (b % every === 0 || to === log.length) { committed = to; saved = new Map(state); } });
    for (let s = 0; s < steps.length; s += 1) {
      (steps[s] as () => void)();
      if (s + 1 === crashAfter) break;                // the process dies here; memory is lost
    }
    if (crashAfter > 0) {
      state = strategy === "checkpoint" ? new Map(saved) : new Map();
      position = committed;                           // restart from the committed offset
      b = Math.floor(committed / batch);
    } else position = to;
  }
  const truth = new Map<string, number>();
  for (const c of log) truth.set(key(c), (truth.get(key(c)) ?? 0) + 1);
  let counted = 0, keysWrong = 0;
  for (const v of store.values()) counted += v;
  for (const [k, v] of truth) if (store.get(k) !== v) keysWrong += 1;
  return { strategy, crashes, counted, truth: log.length, keysWrong };
}
