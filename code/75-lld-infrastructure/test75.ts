import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { exponential, fullJitter, seeded } from "./backoff.ts";
import { FakeClock, systemClock } from "./clock.ts";
import { json, Logger, LineSink, MemorySink, redact, sample, text, type LogRecord, type Sink } from "./logger.ts";
import { Bus } from "./pubsub.ts";
import { BoundedQueue } from "./queue.ts";
import { Scheduler } from "./scheduler.ts";
import { behind, burst, herd, onInterval, ordering, slowSubscriber, spread } from "./simulate.ts";

let unhandled = 0;
process.on("unhandledRejection", () => void (unhandled += 1));

// ======================================================================= the bounded queue
{
  const policies = ["drop-newest", "drop-oldest", "block"] as const;
  const after = policies.map((overflow) => {
    const q = new BoundedQueue<number>(3, overflow);
    const waits = [1, 2, 3, 4, 5].map((n) => q.put(n));
    const out: number[] = [];
    for (let next = q.poll(); next !== undefined; next = q.poll()) out.push(next.item);
    return { overflow, out, dropped: q.dropped, blocked: waits.filter((w) => w !== undefined).length };
  });
  assert.deepEqual(after[0], { overflow: "drop-newest", out: [1, 2, 3], dropped: 2, blocked: 0 });
  assert.deepEqual(after[1], { overflow: "drop-oldest", out: [3, 4, 5], dropped: 2, blocked: 0 });
  assert.deepEqual(after[2], { overflow: "block", out: [1, 2, 3, 4, 5], dropped: 0, blocked: 2 }); // 4 and 5 waited for room
  console.log("bounded queue of 3, five puts:", after.map((a) => `${a.overflow} -> ${a.out.join(",")}`).join(" | "));
}

// ======================================================================= the logger
{
  const clock = new FakeClock(Date.UTC(2026, 9, 12, 9, 30));
  const memory = new MemorySink();
  const root = Logger.create({ clock, sinks: [memory], level: "info" });
  const request = root.child({ service: "photos" }).child({ request: "r7", user: "ana" });
  request.info("upload stored", { bytes: 2048, user: "ana@example" }); // a field passed in the call wins
  request.debug("not written: below the level");
  assert.equal(memory.records.length, 1);
  assert.deepEqual(memory.records[0]?.fields, { service: "photos", request: "r7", user: "ana@example", bytes: 2048 });
  console.log("json:", json(memory.records[0] as LogRecord));
  console.log("text:", text(memory.records[0] as LogRecord));

  // filters: a chain that can change a record or stop it
  const kept = new MemorySink();
  const filtered = Logger.create({ clock, sinks: [kept], level: "debug", filters: [redact(["password", "card"]), sample("debug", 0.1, seeded(5))] });
  filtered.info("payment", { order: 9, card: "4111 1111 1111 1111", payer: { name: "Ana", password: "hunter2" } });
  assert.deepEqual(kept.records[0]?.fields, { order: 9, card: "[redacted]", payer: { name: "Ana", password: "[redacted]" } });
  for (let i = 0; i < 1000; i += 1) filtered.debug("cache hit", { i });
  const debugKept = kept.records.filter((r) => r.level === "debug").length;
  assert.ok(debugKept > 70 && debugKept < 130);
  console.log(`sample(debug, 0.1): kept ${debugKept} of 1,000 debug records; info and above all kept`);

  // values JSON.stringify cannot write
  const loop: Record<string, unknown> = { id: 1 };
  loop["self"] = loop;
  const messages: string[] = [];
  for (const value of [loop, { big: 2n ** 64n }]) {
    try {
      JSON.stringify(value);
    } catch (error) {
      messages.push(`${(error as Error).name}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  assert.equal(messages.length, 2);
  console.log("JSON.stringify threw:", messages.join(" | "));
  const lines: string[] = [];
  Logger.create({ clock, sinks: [new LineSink((l) => lines.push(l))] }).warn("odd values", { loop, big: 2n ** 64n, error: new Error("disk full"), twice: [loop, loop] });
  assert.ok(lines[0]?.includes('"self":"[circular]"') && lines[0].includes('"big":"18446744073709551616"'));
  assert.ok(!lines[0]?.includes('"twice":["[circular]"')); // the same object twice is not a cycle
  console.log("json with a cycle, a BigInt and an Error:", lines[0]);

  // never take the application down: a sink that throws, one that rejects, a filter that throws
  const good = new MemorySink();
  const throws: Sink = { write: () => { throw new Error("disk full"); } };
  const rejects: Sink = { write: async () => { throw new Error("collector unreachable"); } };
  const reports: string[] = [];
  const log = Logger.create({ clock, sinks: [throws, rejects, good], report: (e) => reports.push((e as Error).message) });
  for (let i = 0; i < 1000; i += 1) log.info("still running", { i });
  await sleep(10);
  assert.equal(good.records.length, 1000);
  assert.equal(log.failures(throws), 1000);
  assert.equal(log.failures(rejects), 1000);
  assert.deepEqual(reports, ["disk full", "collector unreachable"]); // told once about each, not a thousand times
  assert.equal(unhandled, 0);
  console.log(`failing sinks: 1,000 calls, none threw; healthy sink got ${good.records.length}; failures counted ${log.failures(throws)} and ${log.failures(rejects)}; reported ${reports.length} times; unhandled rejections ${unhandled}`);

  const broken = Logger.create({ clock, sinks: [good], filters: [() => { throw new Error("bad filter"); }], report: () => {} });
  assert.equal(broken.info("password=hunter2"), undefined); // dropped, not written unfiltered, and nothing thrown
  assert.equal(good.records.length, 1000);
  assert.equal(broken.failures("filters"), 1);
}

// ---- a burst into the buffered sink, under each overflow policy
{
  const results = [];
  for (const overflow of ["drop-newest", "drop-oldest", "block"] as const) {
    const r = await burst(overflow);
    results.push(r);
    console.log(`burst ${overflow}: written ${r.written.length}, dropped ${r.dropped}, first written ${r.written.slice(0, 3).join(",")}..., last written ${r.written.slice(-3).join(",")}, application finished logging at ${r.finishedAt} ms (longest single wait ${r.longestWait} ms), last write at ${r.lastWrite} ms`);
  }
  const [newest, oldest, block] = results;
  assert.ok(newest && oldest && block);
  assert.equal(newest.written.length + newest.dropped, 1000);
  assert.deepEqual(newest.written.slice(0, 110), Array.from({ length: 110 }, (_, i) => i)); // the start of the burst survives
  assert.deepEqual(oldest.written.slice(-100), Array.from({ length: 100 }, (_, i) => 900 + i)); // the end survives
  assert.equal(block.written.length, 1000);
  assert.ok(block.finishedAt > 8 * newest.finishedAt); // nothing lost, and the application was slowed to the sink's pace
}

// ======================================================================= publish and subscribe
{
  type Topics = { "photo.added": { id: number }; "album.shared": { album: string } };
  const errors: string[] = [];
  const bus = new Bus<Topics>((error, topic) => errors.push(`${String(topic)}: ${(error as Error).message}`));
  const seen: string[] = [];
  bus.subscribe("photo.added", (m) => void seen.push(`feed ${m.id}`));
  const stopSearch = bus.subscribe("photo.added", () => { throw new Error("index down"); });
  bus.subscribe("photo.added", async (m) => { seen.push(`mail ${m.id}`); throw new Error("mail rejected"); });
  await bus.publish("photo.added", { id: 1 });
  assert.deepEqual(seen, ["feed 1", "mail 1"]);
  assert.deepEqual(errors, ["photo.added: index down", "photo.added: mail rejected"]);
  stopSearch();
  stopSearch(); // harmless
  await bus.publish("photo.added", { id: 2 });
  assert.equal(errors.length, 3); // only mail failed this time
  assert.equal(bus.subscribers("photo.added"), 2);
  assert.equal(bus.publish("album.shared", { album: "x" }), undefined); // no subscribers, nothing to wait for

  // a handler that unsubscribes itself during delivery: the others still get this message
  const once: string[] = [];
  const stop = bus.subscribe("album.shared", () => { once.push("a"); stop(); });
  bus.subscribe("album.shared", () => void once.push("b"));
  bus.publish("album.shared", { album: "trip" });
  bus.publish("album.shared", { album: "trip" });
  assert.deepEqual(once, ["a", "b", "b"]);
  assert.equal(unhandled, 0);
  console.log("pub/sub: a throwing and a rejecting subscriber; the others got every message; errors reported:", errors.length);

  // closing a queued subscription releases a publisher that was waiting for room
  const clock = new FakeClock();
  const blockBus = new Bus<{ job: number }>(() => {});
  const off = blockBus.subscribe("job", () => clock.sleep(1000), { mode: "queued", capacity: 1, overflow: "block" });
  blockBus.publish("job", 1);
  blockBus.publish("job", 2);
  let released = false;
  void blockBus.publish("job", 3)?.then(() => void (released = true));
  await clock.advanceTo(10);
  assert.equal(released, false);
  off();
  await clock.advanceTo(20);
  assert.equal(released, true);
}
{
  const sync = await ordering("sync");
  const queued = await ordering("queued");
  console.log(`ordering, async handler of 1-20 ms, 100 messages: sync ran up to ${sync.most} at once, ${sync.overtook} finished before an earlier message | queued ran ${queued.most} at a time, in order: ${queued.inOrder}`);
  assert.equal(queued.inOrder, true);
  assert.equal(queued.most, 1);
  assert.ok(sync.overtook > 0);
}
for (const overflow of ["drop-newest", "drop-oldest", "block"] as const) {
  const r = await slowSubscriber(overflow);
  console.log(`slow subscriber, ${overflow}: publisher done at ${r.publishedBy} ms, fast handled ${r.fast}, slow handled ${r.slow}`);
  assert.equal(r.fast, 1000);
  if (overflow === "block") assert.equal(r.slow, 1000);
  else assert.equal(r.publishedBy, 1000);
}

// ======================================================================= the scheduler
{
  const clock = new FakeClock();
  const order: string[] = [];
  const s = new Scheduler(clock, { concurrency: 3, onError: () => {} });
  for (const [name, at] of [["c", 30], ["a", 10], ["b", 20], ["a2", 10]] as const) s.at(at, () => void order.push(name));
  const dropped = s.at(15, () => void order.push("canceled"));
  dropped.cancel();
  await clock.advanceTo(100);
  assert.deepEqual(order, ["a", "a2", "b", "c"]); // by time, and ties in the order they were added

  // a concurrency limit of 3, ten tasks of 100 ms due at once
  const starts: number[] = [];
  let running = 0, most = 0;
  for (let i = 0; i < 10; i += 1) {
    s.at(200, async () => {
      starts.push(clock.now() - 200);
      most = Math.max(most, ++running);
      await clock.sleep(100);
      running -= 1;
    });
  }
  await clock.advanceTo(1000);
  assert.deepEqual(starts, [0, 0, 0, 100, 100, 100, 200, 200, 200, 300]);
  assert.equal(most, 3);
  console.log("concurrency 3, ten 100 ms tasks due together: started at", starts.join(", "), "ms; all done at 400 ms");

  // a periodic task: canceled after its third run
  let runs = 0;
  const every = s.every(1000, () => void (runs += 1));
  await clock.advanceTo(clock.now() + 3500);
  every.cancel();
  await clock.advanceTo(clock.now() + 5000);
  assert.equal(runs, 3);
}
{
  // retries: fail five times, then succeed
  const attempts = async (backoff: (attempt: number) => number) => {
    const clock = new FakeClock();
    const at: number[] = [];
    const s = new Scheduler(clock, { concurrency: 1, onError: () => {} });
    s.at(0, ({ attempt }) => {
      at.push(clock.now());
      if (attempt <= 5) throw new Error("not yet");
    }, { retry: { attempts: 8, backoff } });
    await clock.advanceTo(100_000);
    return at;
  };
  const plain = await attempts(exponential(100, 10_000));
  const jittered = await attempts(fullJitter(exponential(100, 10_000), seeded(1)));
  assert.deepEqual(plain, [0, 100, 300, 700, 1500, 3100]);
  console.log("attempts without jitter at", plain.join(", "), "ms; with full jitter (seed 1) at", jittered.join(", "), "ms");

  // a run that uses all its attempts is reported, and the periodic schedule goes on
  const clock = new FakeClock();
  const failures: string[] = [];
  let calls = 0;
  const s = new Scheduler(clock, { concurrency: 1, onError: (e, name) => failures.push(`${name}: ${(e as Error).message}`) });
  s.every(1000, () => {
    calls += 1;
    if (calls <= 2) throw new Error("export failed");
  }, { name: "export", retry: { attempts: 2, backoff: () => 10 } });
  await clock.advanceTo(3500);
  assert.deepEqual(failures, ["export: export failed"]); // run 1 failed twice and gave up; run 2 failed once, then succeeded
  assert.equal(calls, 4);
}
{
  const fmt = (runs: { due: number; start: number; end: number }[]) => runs.map((r) => `${r.start / 1000}-${r.end / 1000}`).join(" ");
  const over = { catchUp: await behind("catch-up", 10_000, 25_000, null, 100_000), once: await behind("once", 10_000, 25_000, null, 100_000), skip: await behind("skip", 10_000, 25_000, null, 100_000) };
  const interval = await onInterval(10_000, 25_000, 100_000);
  console.log("every 10 s, each run takes 25 s. setInterval:", fmt(interval), "| catch-up:", fmt(over.catchUp), "| once:", fmt(over.once), "| skip:", fmt(over.skip));
  assert.deepEqual(over.skip.map((r) => r.start), [0, 30_000, 60_000]);
  assert.deepEqual(over.once.map((r) => r.start), [0, 25_000, 50_000, 75_000]);
  assert.deepEqual(over.catchUp.map((r) => r.start - r.due), [0, 15_000, 30_000, 45_000]); // falling further behind
  const paused = { catchUp: await behind("catch-up", 10_000, 2_000, [15_000, 55_000], 100_000), once: await behind("once", 10_000, 2_000, [15_000, 55_000], 100_000), skip: await behind("skip", 10_000, 2_000, [15_000, 55_000], 100_000) };
  console.log("every 10 s, runs of 2 s, paused from 15 s to 55 s. catch-up:", fmt(paused.catchUp), "| once:", fmt(paused.once), "| skip:", fmt(paused.skip));
  assert.deepEqual(paused.catchUp.slice(2, 7).map((r) => r.due / 1000), [20, 30, 40, 50, 60]);
  assert.deepEqual(paused.once.map((r) => r.start / 1000), [0, 10, 55, 60, 70, 80, 90]);
  assert.deepEqual(paused.skip.map((r) => r.start / 1000), [0, 10, 60, 70, 80, 90]);
}
{
  // Node's own timers, on the real clock
  let inFlight = 0, most = 0;
  const handle = setInterval(async () => {
    most = Math.max(most, ++inFlight);
    await sleep(25);
    inFlight -= 1;
  }, 10);
  await sleep(200);
  clearInterval(handle);
  await sleep(40);
  console.log(`setInterval every 10 ms with an async task of 25 ms: up to ${most} runs at once`);
  assert.ok(most >= 2);

  const child = spawnSync(process.execPath, ["-e", "const t = performance.now(); setTimeout(() => console.log(Math.round(performance.now() - t)), 2 ** 31)"], { encoding: "utf8" });
  const warning = child.stderr.split("\n").find((line) => line.includes("Warning")) ?? "no warning";
  console.log(`setTimeout(fn, 2 ** 31), about 24.9 days: fired after ${child.stdout.trim()} ms, with "${warning.replace(/^\(node:\d+\) /, "")}"`);
  assert.ok(Number(child.stdout) < 1000);
  let fired = false;
  const cancel = systemClock.at(Date.now() + 2 ** 31, () => void (fired = true));
  await sleep(50);
  cancel();
  assert.equal(fired, false);
}
{
  const plain = await herd(false);
  const jittered = await herd(true);
  for (const h of [plain, jittered]) {
    console.log(`herd, ${h.jitter ? "full jitter" : "no jitter"}: ${h.calls} calls, ${h.succeeded} succeeded, ${h.gaveUp} gave up, last success at ${h.lastSuccess} ms, busiest 10 ms after the start: ${h.busiestAfterStart} calls`);
  }
  assert.equal(plain.succeeded, 100);
  assert.equal(jittered.succeeded, 1000);
  const quiet = await spread(false, 1000, 5);
  const spreadOut = await spread(true, 1000, 5);
  console.log(`1,000 clients, 5 retries each, dependency down: busiest 10 ms ${quiet.busiest10ms} retries without jitter, ${spreadOut.busiest10ms} with full jitter (seed 11)`);
}
assert.equal(unhandled, 0);
console.log("all tests passed");
