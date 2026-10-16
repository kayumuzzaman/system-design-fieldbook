import assert from "node:assert/strict";
import { order } from "./order.ts";
import { countPrimes, countPrimesPolitely, latenessDuring } from "./blocking.ts";
import { allAtOnce, inSequence, mapLimit, sleep } from "./together.ts";
import { Quota } from "./race.ts";
import { KeyedMutex, Mutex, withBoth } from "./mutex.ts";
import { latestOnly, withTimeout } from "./stale.ts";
import { countPrimesOnThreads, countTogether } from "./parallel.ts";

const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => { const t = performance.now(); const value = await fn(); return [value, Math.round(performance.now() - t)]; };

// --- the event loop's order
const log = await order();
assert.deepEqual(log.map((line) => line[0]).join(""), "ABCDEF");
console.log("order:\n  " + log.join("\n  "));

// --- blocking the loop
const LIMIT = 3_000_000;
const [primes, inlineMs] = await timed(async () => countPrimes(0, LIMIT));
const lateInline = await latenessDuring(() => countPrimes(0, LIMIT));
const [polite, politeMs] = await timed(() => countPrimesPolitely(0, LIMIT));
const latePolite = await latenessDuring(() => countPrimesPolitely(0, LIMIT));
const lateWorker = await latenessDuring(() => countPrimesOnThreads(LIMIT, 1));
assert.equal(primes, 216816); assert.equal(polite, primes);
assert.ok(lateInline > inlineMs * 0.7); assert.ok(latePolite < 50); assert.ok(lateWorker < 50);
console.log(`blocking: ${primes} primes below ${LIMIT} in ${inlineMs} ms | a 10 ms timer fired ${lateInline} ms late (inline), ${latePolite} ms late (in slices, total ${politeMs} ms), ${lateWorker} ms late (on a worker thread)`);

// --- sequential and concurrent awaits
const fetchSize = async (id: number) => { await sleep(100); return id * 10; };
const [seq, seqMs] = await timed(() => inSequence([1, 2, 3], fetchSize));
const [all, allMs] = await timed(() => allAtOnce([1, 2, 3], fetchSize));
assert.deepEqual(seq, [10, 20, 30]); assert.deepEqual(all, seq);
assert.ok(seqMs >= 295 && seqMs < 400); assert.ok(allMs >= 95 && allMs < 160);
let inFlight = 0, most = 0;
const tracked = async (id: number) => { inFlight += 1; most = Math.max(most, inFlight); await sleep(50); inFlight -= 1; return id; };
const [limited, limitedMs] = await timed(() => mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, tracked));
assert.deepEqual(limited, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); assert.equal(most, 3);
const settled = await Promise.allSettled([fetchSize(1), Promise.reject(new Error("timeout")), fetchSize(3)]);
assert.deepEqual(settled.map((s) => s.status), ["fulfilled", "rejected", "fulfilled"]);
await assert.rejects(Promise.all([fetchSize(1), Promise.reject(new Error("timeout"))]), /timeout/);
console.log(`together: three 100 ms calls in sequence ${seqMs} ms, all at once ${allMs} ms | ten 50 ms calls, 3 at a time: ${limitedMs} ms, most in flight ${most}`);

// --- a race with one thread: five uploads of 30 against a limit of 100
const save = () => sleep(20);
const racy = new Quota(100, save);
const racyResults = await Promise.all([30, 30, 30, 30, 30].map((b) => racy.addRacy(b)));
const reserved = new Quota(100, save);
const reservedResults = await Promise.all([30, 30, 30, 30, 30].map((b) => reserved.addReserved(b)));
assert.equal(racy.used, 150); assert.equal(reserved.used, 90);
assert.deepEqual(reservedResults, [true, true, true, false, false]);
const failing = new Quota(100, async () => { await sleep(5); throw new Error("disk full"); });
await assert.rejects(failing.addReserved(30), /disk full/); assert.equal(failing.used, 0);
// the two-upload case drawn in the chapter's figure: a limit of 50 and two uploads of 30
const smallRacy = new Quota(50, save); await Promise.all([smallRacy.addRacy(30), smallRacy.addRacy(30)]); assert.equal(smallRacy.used, 60);
const smallSafe = new Quota(50, save); assert.deepEqual(await Promise.all([smallSafe.addReserved(30), smallSafe.addReserved(30)]), [true, false]); assert.equal(smallSafe.used, 30);
const locked = new Quota(100, save), mutex = new Mutex();
const [lockedResults, lockedMs] = await timed(() => Promise.all([30, 30, 30, 30, 30].map((b) => mutex.run(() => locked.addRacy(b)))));
assert.equal(locked.used, 90); assert.deepEqual(lockedResults, [true, true, true, false, false]);
const [, reservedMs] = await timed(() => Promise.all([10, 10, 10].map((b) => new Quota(100, save).addReserved(b))));
console.log(`race: racy accepted ${racyResults.filter(Boolean).length} of 5, used ${racy.used} of 100 | reserved accepted ${reservedResults.filter(Boolean).length}, used ${reserved.used} | behind a mutex accepted ${lockedResults.filter(Boolean).length}, used ${locked.used}, took ${lockedMs} ms against ${reservedMs} ms`);

// --- mutex details: order, failures, keys
const seen: number[] = []; const m = new Mutex();
const jobs = [3, 1, 2].map((n) => m.run(async () => { await sleep(n * 10); seen.push(n); if (n === 1) throw new Error("job 1 failed"); return n; }));
const outcomes = await Promise.allSettled(jobs);
assert.deepEqual(seen, [3, 1, 2]); assert.deepEqual(outcomes.map((o) => o.status), ["fulfilled", "rejected", "fulfilled"]);
const keyed = new KeyedMutex();
const [, keyedMs] = await timed(() => Promise.all([keyed.run("ana", () => sleep(40)), keyed.run("ana", () => sleep(40)), keyed.run("ben", () => sleep(40))]));
assert.ok(keyedMs >= 78 && keyedMs < 115); assert.equal(keyed.size, 0);
console.log(`mutex: ran in arrival order ${JSON.stringify(seen)}, a failure did not block the next | two jobs for ana and one for ben, 40 ms each: ${keyedMs} ms`);

// --- deadlock: two locks taken in opposite orders
const stuck = Symbol("stuck");
const giveUp = (ms: number) => sleep(ms).then(() => stuck);
const albumA = new Mutex(), albumB = new Mutex();
const moveAtoB = albumA.run(async () => { await sleep(10); return albumB.run(async () => "moved A to B"); });
const moveBtoA = albumB.run(async () => { await sleep(10); return albumA.run(async () => "moved B to A"); });
assert.equal(await Promise.race([Promise.all([moveAtoB, moveBtoA]), giveUp(300)]), stuck);
const a2 = new Mutex(), b2 = new Mutex();
const ordered = await Promise.race([Promise.all([
  withBoth(["album-a", a2], ["album-b", b2], async () => { await sleep(10); return "moved A to B"; }),
  withBoth(["album-b", b2], ["album-a", a2], async () => { await sleep(10); return "moved B to A"; }),
]), giveUp(300)]);
assert.deepEqual(ordered, ["moved A to B", "moved B to A"]);
console.log("deadlock: opposite order -> still waiting after 300 ms | fixed order ->", JSON.stringify(ordered));

// --- stale answers and timeouts
const delays: Record<string, number> = { li: 80, lis: 20 };
const search = async (query: string) => { await sleep(delays[query] ?? 10); return `results for "${query}"`; };
let shown = "";
await Promise.all(["li", "lis"].map(async (q) => { shown = await search(q); }));
assert.equal(shown, 'results for "li"'); // the older, slower answer arrived last and overwrote the newer one
const latest = latestOnly(search); let shownLatest = "";
const answers = await Promise.all(["li", "lis"].map(async (q) => { const r = await latest(q); if (r !== undefined) shownLatest = r; return r; }));
assert.deepEqual(answers, [undefined, 'results for "lis"']); assert.equal(shownLatest, 'results for "lis"');
let stopped = false;
const slow = (signal: AbortSignal) => new Promise<string>((resolve) => { const t = setTimeout(() => resolve("late"), 500); signal.addEventListener("abort", () => { clearTimeout(t); stopped = true; }); });
const [timeoutError, timeoutMs] = await timed(() => withTimeout(50, slow).catch((e: Error) => e.name));
assert.equal(timeoutError, "TimeoutError"); assert.ok(timeoutMs < 120); assert.equal(stopped, true);
assert.equal(await withTimeout(200, async () => "in time"), "in time");
console.log(`latest: without the guard the screen ended on ${shown} | with it ${shownLatest} | timeout after ${timeoutMs} ms with ${timeoutError}, work stopped: ${stopped}`);

// --- an async listener: the emitter does not wait, and a rejection has nowhere to go
const unhandled: string[] = [];
process.on("unhandledRejection", (reason) => { unhandled.push((reason as Error).message); });
const listeners: Array<(photo: string) => unknown> = [async () => { await sleep(5); throw new Error("index is down"); }];
const emit = (photo: string) => { for (const listener of listeners) { try { listener(photo); } catch { assert.fail("never reached"); } } };
emit("p1");
await sleep(30);
assert.deepEqual(unhandled, ["index is down"]);
console.log("async listener: emit returned at once, the try/catch caught nothing, and the process received an unhandled rejection:", unhandled[0]);

// --- threads: real parallelism, and a real data race
const cores = (await import("node:os")).availableParallelism();
const [one, oneMs] = await timed(() => countPrimesOnThreads(LIMIT * 2, 1));
const [two, twoMs] = await timed(() => countPrimesOnThreads(LIMIT * 2, 2));
assert.equal(one, two);
const TIMES = 2_000_000;
const plain = await countTogether(2, TIMES, false), atomic = await countTogether(2, TIMES, true);
assert.equal(atomic, 2 * TIMES); assert.ok(plain <= 2 * TIMES);
console.log(`threads (${cores} cores): ${one} primes below ${LIMIT * 2} on 1 thread ${oneMs} ms, on 2 threads ${twoMs} ms | two threads adding 1 two million times each: plain ${plain}, atomic ${atomic}, expected ${2 * TIMES}`);
console.log("all assertions passed");
