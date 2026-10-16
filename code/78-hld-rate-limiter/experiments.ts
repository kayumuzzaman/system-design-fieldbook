// The simulations behind the chapter's numbers. Every one is seeded, so it prints the same result on every run.
import { tokenBucket } from "./algorithms.ts";
import { AtomicScript, Guarded, LocalShare, ReadThenWrite, SyncedWindow, atomicWindow } from "./limiters.ts";
import type { Limiter, Policy } from "./limiters.ts";
import { Rng } from "./rng.ts";
import { Sim, poisson } from "./sim.ts";
import { CounterStore } from "./store.ts";

interface Tally {
  offered: number;
  allowed: number;
  ms: number[];
}
const tally = (): Tally => ({ offered: 0, allowed: 0, ms: [] });
export const percentile = (xs: number[], p: number): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
};

// Sends one client's requests, at random times, each to a random server of the fleet (or always to the first).
function drive(sim: Sim, rng: Rng, fleet: Limiter[], key: string, perSecond: number, toMs: number, fromMs: number, into: Tally, oneServer = false): void {
  poisson(sim, rng, perSecond, 0, toMs, (t) => {
    const server = oneServer ? fleet[0] : fleet[rng.below(fleet.length)];
    server!.handle(key, (o) => {
      if (t < fromMs) return;
      into.offered++;
      if (o.allowed) into.allowed++;
      into.ms.push(o.ms);
    });
  });
}

// A. The race. One client, a limit of 100 a second, 20 servers sharing one store.
export function race(rates = [100, 200, 500, 1000, 2000, 5000], servers = 20, limit = 100, seconds = 10) {
  return rates.map((rate) => {
    const result = (kind: "read then write" | "script") => {
      const sim = new Sim();
      const store = new CounterStore(sim, new Rng(12));
      const algorithm = tokenBucket(limit, 1000);
      const fleet: Limiter[] = Array.from({ length: servers }, () =>
        kind === "script" ? new AtomicScript(sim, store, algorithm) : new ReadThenWrite(sim, store, algorithm));
      const t = tally();
      drive(sim, new Rng(11), fleet, "client", rate, (seconds + 1) * 1000, 1000, t);
      sim.run(Infinity);
      return { allowedPerSecond: t.allowed / seconds, medianMs: percentile(t.ms, 0.5), p99Ms: percentile(t.ms, 0.99) };
    };
    return { rate, readThenWrite: result("read then write"), script: result("script") };
  });
}

// B. Local limits: each of n servers allows a client limit ÷ n a second, and shares nothing.
export function localShares(fleetSizes = [1, 2, 5, 10, 20, 50], limit = 100, seconds = 10) {
  return fleetSizes.map((n) => {
    const sim = new Sim();
    const fleet = Array.from({ length: n }, () => new LocalShare(sim, tokenBucket(limit / n, 1000)));
    const atLimit = tally(), oneConnection = tally(), abusive = tally();
    drive(sim, new Rng(21), fleet, "at the limit", limit, (seconds + 1) * 1000, 1000, atLimit);
    drive(sim, new Rng(22), fleet, "one connection", limit, (seconds + 1) * 1000, 1000, oneConnection, true);
    drive(sim, new Rng(23), fleet, "abusive", 10 * limit, (seconds + 1) * 1000, 1000, abusive);
    sim.run(Infinity);
    return {
      servers: n,
      atLimitServed: atLimit.allowed / atLimit.offered, // share of a client's requests served when it sends exactly its limit
      oneConnectionServed: oneConnection.allowed / oneConnection.offered,
      abusivePerSecond: abusive.allowed / seconds,
    };
  });
}

// C. Counting locally and syncing every interval, against counting every request in the store.
export function syncIntervals(intervals = [0, 10, 50, 100, 250, 500, 1000], servers = 20, limit = 100, seconds = 10) {
  return intervals.map((syncMs) => {
    const sim = new Sim();
    const store = new CounterStore(sim, new Rng(32));
    const phases = new Rng(33);
    const fleet: Limiter[] = Array.from({ length: servers }, () =>
      syncMs === 0 ? atomicWindow(sim, store, limit, 1000) : new SyncedWindow(sim, store, limit, 1000, syncMs, phases.float() * syncMs));
    const abusive = tally(), normal = tally();
    drive(sim, new Rng(31), fleet, "abusive", 10 * limit, (seconds + 1) * 1000, 1000, abusive);
    drive(sim, new Rng(34), fleet, "normal", 0.8 * limit, (seconds + 1) * 1000, 1000, normal);
    sim.run((seconds + 1) * 1000 + 50);
    return {
      syncMs,
      abusivePerSecond: abusive.allowed / seconds,
      normalServed: normal.allowed / normal.offered,
      storeCommandsPerSecond: store.commands / (seconds + 1),
    };
  });
}

// D. The store is down from second 10 to second 40. What gets through, and how long decisions take.
export function outage(policies: Policy[] = ["fail open", "fail closed", "local share"], servers = 20, limit = 100, timeoutMs = 5) {
  const run = (policy: Policy, breaker: boolean) => {
    const sim = new Sim();
    const store = new CounterStore(sim, new Rng(42));
    const algorithm = tokenBucket(limit, 1000);
    const fleet: Limiter[] = Array.from({ length: servers }, () =>
      new Guarded(sim, new AtomicScript(sim, store, algorithm), new LocalShare(sim, tokenBucket(limit / servers, 1000)), policy, timeoutMs,
        breaker ? { failures: 5, openMs: 1000 } : null));
    const seconds = 50;
    const normal = Array.from({ length: seconds }, tally), abusive = Array.from({ length: seconds }, tally);
    const send = (key: string, perSecond: number, seed: number, into: Tally[]) => {
      const rng = new Rng(seed);
      poisson(sim, rng, perSecond, 0, seconds * 1000, (t) => {
        fleet[rng.below(servers)]!.handle(key, (o) => {
          const s = into[Math.floor(t / 1000)]!;
          s.offered++;
          if (o.allowed) s.allowed++;
          s.ms.push(o.ms);
        });
      });
    };
    send("normal", 0.5 * limit, 41, normal);
    send("abusive", 10 * limit, 43, abusive);
    sim.at(10_000, () => (store.up = false));
    sim.at(40_000, () => (store.up = true));
    sim.run(Infinity);
    const during = (xs: Tally[]) => xs.slice(11, 40); // whole seconds inside the outage, after the first
    const sum = (xs: Tally[], f: (t: Tally) => number) => xs.reduce((a, t) => a + f(t), 0);
    const outageMs = during(normal).flatMap((t) => t.ms).concat(during(abusive).flatMap((t) => t.ms));
    return {
      policy,
      breaker,
      normalPerSecond: normal.map((t) => t.allowed),
      normalOfferedPerSecond: normal.map((t) => t.offered),
      abusivePerSecond: abusive.map((t) => t.allowed),
      normalServedDuring: sum(during(normal), (t) => t.allowed) / sum(during(normal), (t) => t.offered),
      abusiveDuring: sum(during(abusive), (t) => t.allowed) / during(abusive).length,
      p50MsDuring: percentile(outageMs, 0.5),
      p99MsDuring: percentile(outageMs, 0.99),
      waitedDuring: outageMs.filter((ms) => ms >= timeoutMs - 1e-9).length / outageMs.length, // decisions that sat out the whole timeout
    };
  };
  return { timeoutMs, runs: [...policies.map((p) => run(p, false)), run("local share", true)] };
}

