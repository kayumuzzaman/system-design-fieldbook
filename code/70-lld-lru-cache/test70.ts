import assert from "node:assert/strict";
import type { Cache } from "./cache.ts";
import { LruCache, LruMapCache } from "./lru.ts";
import { LfuCache } from "./lfu.ts";
import { FifoCache, NaiveLfu, NaiveLru } from "./naive.ts";
import { LoadingCache } from "./loading.ts";
import { hitRatio, ITEMS, seeded, shifting, steady, withScans, zipf } from "./workload.ts";

// --- LRU by hand: capacity 3
const lru = new LruCache<string, number>(3);
lru.put("a", 1); lru.put("b", 2); lru.put("c", 3);
assert.deepEqual(lru.keys(), ["c", "b", "a"]);
assert.equal(lru.get("a"), 1); assert.deepEqual(lru.keys(), ["a", "c", "b"]);                  // reading a makes it the newest
lru.put("d", 4); assert.deepEqual(lru.keys(), ["d", "a", "c"]); assert.equal(lru.get("b"), undefined); // b was the least recently used
lru.put("e", 5); assert.deepEqual(lru.keys(), ["e", "d", "a"]);                                 // c goes next, not a
lru.put("a", 10); assert.equal(lru.get("a"), 10); assert.equal(lru.size, 3);                    // updating is a use, and adds nothing
assert.equal(lru.delete("d"), true); assert.equal(lru.delete("d"), false); assert.deepEqual(lru.keys(), ["a", "e"]);
assert.throws(() => new LruCache(0), /capacity/);
const one = new LruCache<string, number>(1); one.put("x", 1); one.put("y", 2); assert.deepEqual(one.keys(), ["y"]);

// the exercise at the end of the chapter
const two = new LruCache<number, string>(2); two.put(1, "a"); two.put(2, "b");
assert.equal(two.get(1), "a"); two.put(3, "c"); assert.equal(two.get(2), undefined); two.put(4, "d"); assert.deepEqual(two.keys(), [4, 3]);

// --- LFU by hand: capacity 3
const lfu = new LfuCache<string, number>(3);
lfu.put("a", 1); lfu.put("b", 2); lfu.put("c", 3); lfu.get("a"); lfu.get("a"); lfu.get("b");
assert.deepEqual(lfu.snapshot(), [{ uses: 1, keys: ["c"] }, { uses: 2, keys: ["b"] }, { uses: 3, keys: ["a"] }]);
lfu.put("d", 4); assert.equal(lfu.get("c"), undefined);                                         // c had the fewest uses
lfu.get("d"); assert.deepEqual(lfu.snapshot(), [{ uses: 2, keys: ["b", "d"] }, { uses: 3, keys: ["a"] }]);
lfu.put("e", 5); assert.equal(lfu.get("b"), undefined); assert.equal(lfu.get("d"), 4);          // b and d tie on uses: b was used longer ago
assert.deepEqual(lfu.snapshot(), [{ uses: 1, keys: ["e"] }, { uses: 3, keys: ["a", "d"] }]);

// --- the fast versions against the slow, obviously correct ones: 200,000 random operations each
const sameAs = (name: string, fast: Cache<number, number>, slow: Cache<number, number>, seed: number) => {
  const random = seeded(seed);
  for (let i = 0; i < 200_000; i += 1) {
    const key = Math.floor(random() * 60), roll = random();
    if (roll < 0.55) assert.equal(fast.get(key), slow.get(key), `${name}: get ${key} at step ${i}`);
    else if (roll < 0.97) { fast.put(key, i); slow.put(key, i); }
    else assert.equal(fast.delete(key), slow.delete(key));
    assert.ok(fast.size <= fast.capacity); assert.equal(fast.size, slow.size);
  }
};
sameAs("linked list", new LruCache(16), new NaiveLru(16), 1);
sameAs("Map order", new LruMapCache(16), new NaiveLru(16), 2);
sameAs("LFU groups", new LfuCache(16), new NaiveLfu(16), 3);
console.log("agreement: the linked-list LRU, the Map LRU and the grouped LFU each matched a slow reference over 200000 random operations");

// --- loading through the cache: one fetch for many callers, and errors are not kept
let fetches = 0;
const slowFetch = async (key: string) => { fetches += 1; await new Promise((r) => setTimeout(r, 10)); if (key === "bad") throw new Error("not found upstream"); return key.toUpperCase(); };
const loading = new LoadingCache<string, string>(new LruCache(100), slowFetch);
const answers = await Promise.all(Array.from({ length: 50 }, () => loading.get("photo-1")));
assert.equal(fetches, 1); assert.ok(answers.every((a) => a === "PHOTO-1"));
assert.equal(await loading.get("photo-1"), "PHOTO-1"); assert.equal(fetches, 1);                 // later callers get the stored value
await assert.rejects(loading.get("bad"), /not found upstream/); await assert.rejects(loading.get("bad"), /not found upstream/);
assert.equal(fetches, 3);                                                                        // the failure was not cached: the second call tried again
console.log("loading: 50 simultaneous requests for one missing key caused 1 fetch; a failed fetch was retried by the next caller");

// --- hit ratios on three kinds of traffic, with a cache of 5% of the items
const draw = zipf(1000, 1, seeded(7)); const counts = new Array<number>(1000).fill(0);
for (let i = 0; i < 100_000; i += 1) { const rank = draw(); counts[rank] = (counts[rank] as number) + 1; }
assert.ok((counts[0] as number) > (counts[9] as number) && (counts[9] as number) > (counts[99] as number));
const scans = withScans();
const workloads: Record<string, { requests: number[]; fromScan?: boolean[] }> = { "steady popularity": { requests: steady() }, "with scans": scans, "shifting popularity": { requests: shifting() } };
const policies: Record<string, () => Cache<number, number>> = { FIFO: () => new FifoCache(ITEMS * 0.05), LRU: () => new LruCache(ITEMS * 0.05), LFU: () => new LfuCache(ITEMS * 0.05) };
const table: Record<string, Record<string, number>> = {};
for (const [workload, w] of Object.entries(workloads)) {
  table[workload] = {};
  for (const [name, make] of Object.entries(policies)) (table[workload] as Record<string, number>)[name] = hitRatio(make(), w.requests, w.fromScan);
  console.log(`hit ratio, ${workload}: ` + Object.entries(table[workload] as Record<string, number>).map(([n, h]) => `${n} ${(h * 100).toFixed(1)}%`).join(", "));
}
const t = table as Record<string, Record<string, number>>;
assert.ok((t["steady popularity"]?.["LFU"] ?? 0) > (t["steady popularity"]?.["LRU"] ?? 0) && (t["steady popularity"]?.["LRU"] ?? 0) > (t["steady popularity"]?.["FIFO"] ?? 0));
assert.ok((t["shifting popularity"]?.["LRU"] ?? 0) > (t["shifting popularity"]?.["LFU"] ?? 0));
assert.ok((t["steady popularity"]?.["LRU"] ?? 0) - (t["with scans"]?.["LRU"] ?? 0) > 0.03); // scans cost LRU several points
assert.ok((t["steady popularity"]?.["LFU"] ?? 0) - (t["with scans"]?.["LFU"] ?? 0) < 0.01);  // and LFU almost nothing
console.log("all assertions passed");
