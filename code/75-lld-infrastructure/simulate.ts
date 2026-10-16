// Scenarios run on the chapter's code with a fake clock. The tests check them, and figures.ts prints them for the figures.
import { exponential, fullJitter, seeded } from "./backoff.ts";
import { FakeClock } from "./clock.ts";
import { BufferedSink, Logger, type Sink } from "./logger.ts";
import { Bus } from "./pubsub.ts";
import type { Overflow } from "./queue.ts";
import { Scheduler, type Missed } from "./scheduler.ts";

// ---- A burst of 1,000 log records, ten a millisecond, into a buffer of 100 in front of a sink that writes one a millisecond.
export async function burst(overflow: Overflow) {
  const clock = new FakeClock();
  const written: number[] = [];
  let lastWrite = 0;
  const slow: Sink = {
    write: async (record) => {
      await clock.sleep(1);
      written.push(record.fields["seq"] as number);
      lastWrite = clock.now();
    },
  };
  const sink = new BufferedSink(slow, 100, overflow);
  const log = Logger.create({ clock, sinks: [sink] });
  let longestWait = 0;
  let finishedAt = 0;
  const app = (async () => {
    for (let seq = 0; seq < 1000; seq += 1) {
      if (seq > 0 && seq % 10 === 0) await clock.sleep(1);
      const before = clock.now();
      await log.info("burst", { seq }); // waits only when the sink says so
      longestWait = Math.max(longestWait, clock.now() - before);
    }
    finishedAt = clock.now();
  })();
  await clock.advanceTo(10_000);
  await app;
  await sink.flush();
  return { overflow, written, dropped: sink.dropped, longestWait, finishedAt, lastWrite };
}

// ---- One publisher, a fast and a slow subscriber, each with a queue of 50.
export async function slowSubscriber(overflow: Overflow) {
  const clock = new FakeClock();
  const bus = new Bus<{ photo: number }>(() => {});
  const handled = { fast: 0, slow: 0 };
  bus.subscribe("photo", async () => { await clock.sleep(1); handled.fast += 1; }, { mode: "queued", capacity: 50, overflow });
  bus.subscribe("photo", async () => { await clock.sleep(10); handled.slow += 1; }, { mode: "queued", capacity: 50, overflow });
  let publishedBy = 0;
  const publisher = (async () => {
    for (let i = 0; i < 1000; i += 1) {
      await bus.publish("photo", i);
      await clock.sleep(1); // one message a millisecond
    }
    publishedBy = clock.now();
  })();
  await clock.advanceTo(30_000);
  await publisher;
  return { overflow, publishedBy, ...handled };
}

// ---- A periodic task that falls behind. Returns each run: when it was due, when it started and ended.
export interface Span {
  due: number;
  start: number;
  end: number;
}
export async function behind(missed: Missed, every: number, takes: number, pause: [number, number] | null, until: number) {
  const clock = new FakeClock();
  const runs: Span[] = [];
  const scheduler = new Scheduler(clock, { concurrency: 4, onError: () => {} });
  scheduler.at(0, async ({ due }) => {
    const start = clock.now();
    await clock.sleep(takes);
    runs.push({ due, start, end: clock.now() });
  }, { every, missed });
  if (pause !== null) {
    await clock.advanceTo(pause[0]);
    clock.jump(pause[1] - pause[0]); // the process was paused: nothing fired in between
  }
  await clock.advanceTo(until);
  return runs.filter((r) => r.start < until);
}
// The same task on a timer that starts it every period whether or not the last run has finished, as setInterval does.
export async function onInterval(every: number, takes: number, until: number) {
  const clock = new FakeClock();
  const runs: Span[] = [];
  const tick = (due: number): void => {
    clock.at(due + every, () => tick(due + every));
    void clock.sleep(takes).then(() => runs.push({ due, start: due, end: clock.now() }));
  };
  clock.at(0, () => tick(0));
  await clock.advanceTo(until);
  return runs.filter((r) => r.start < until);
}

// ---- 1,000 tasks due at the same moment call one dependency, which serves at most 10 calls in each 10 ms
// (1,000 a second) and refuses the rest at once. Each task retries with exponential backoff: 100 ms doubling to
// at most 10 s, 10 attempts in all.
export async function herd(jitter: boolean, seed = 7) {
  const clock = new FakeClock();
  const base = exponential(100, 10_000);
  const backoff = jitter ? fullJitter(base, seeded(seed)) : base;
  const perSlot = new Map<number, number>(); // calls in each 10 ms
  let calls = 0, succeeded = 0, gaveUp = 0, lastSuccess = 0;
  const scheduler = new Scheduler(clock, { concurrency: Infinity, onError: () => void (gaveUp += 1) });
  for (let i = 0; i < 1000; i += 1) {
    scheduler.at(0, () => {
      const slot = Math.floor(clock.now() / 10);
      const n = (perSlot.get(slot) ?? 0) + 1;
      perSlot.set(slot, n);
      calls += 1;
      if (n > 10) throw new Error("busy, try later");
      succeeded += 1;
      lastSuccess = clock.now();
    }, { retry: { attempts: 10, backoff } });
  }
  await clock.advanceTo(120_000);
  const slots = [...perSlot.entries()];
  return {
    jitter, calls, succeeded, gaveUp, lastSuccess,
    busiestAfterStart: Math.max(...slots.filter(([slot]) => slot > 0).map(([, n]) => n)), // the start itself is the herd
    per10ms: Array.from({ length: 200 }, (_, slot) => perSlot.get(slot) ?? 0), // the first two seconds
  };
}

// ---- The spread of retries when every attempt fails: when do the retries of 1,000 clients arrive?
export async function spread(jitter: boolean, clients: number, retries: number, seed = 11) {
  const clock = new FakeClock();
  const base = exponential(100, 10_000);
  const backoff = jitter ? fullJitter(base, seeded(seed)) : base;
  const perSlot = new Map<number, number>();
  const scheduler = new Scheduler(clock, { concurrency: Infinity, onError: () => {} });
  for (let i = 0; i < clients; i += 1) {
    scheduler.at(0, ({ attempt }) => {
      if (attempt > 1) {
        const slot = Math.floor(clock.now() / 10);
        perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
      }
      throw new Error("down");
    }, { retry: { attempts: retries + 1, backoff } });
  }
  await clock.advanceTo(200_000);
  return { busiest10ms: Math.max(...perSlot.values()), retries: [...perSlot.values()].reduce((a, b) => a + b, 0) };
}

// ---- Ordering: 100 messages, one a millisecond, to a handler that takes 1 to 20 ms. The publisher does not wait.
export async function ordering(mode: "sync" | "queued", seed = 3) {
  const clock = new FakeClock();
  const random = seeded(seed);
  const bus = new Bus<{ order: number }>(() => {});
  const finished: number[] = [];
  let inFlight = 0, most = 0;
  bus.subscribe("order", async (n) => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await clock.sleep(1 + Math.floor(random() * 20));
    finished.push(n);
    inFlight -= 1;
  }, mode === "sync" ? { mode: "sync" } : { mode: "queued", capacity: 1000, overflow: "block" });
  const publisher = (async () => {
    for (let i = 0; i < 100; i += 1) {
      void bus.publish("order", i);
      await clock.sleep(1);
    }
  })();
  await clock.advanceTo(10_000);
  await publisher;
  // messages that finished before at least one message published earlier
  const overtook = finished.filter((n, i) => finished.slice(i + 1).some((m) => m < n)).length;
  return { mode, most, overtook, inOrder: finished.every((n, i) => n === i) };
}
