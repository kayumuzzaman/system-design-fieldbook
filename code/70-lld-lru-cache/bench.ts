// Measurements quoted in the chapter. Not a test: run with `node bench.ts`. Times vary from machine to machine.
import type { Cache } from "./cache.ts";
import { LruCache, LruMapCache } from "./lru.ts";
import { LfuCache } from "./lfu.ts";
import { FifoCache, NaiveLru } from "./naive.ts";
import { hitRatio, ITEMS, seeded, shifting, steady, withScans } from "./workload.ts";

const policies: Record<string, (capacity: number) => Cache<number, number>> = {
  FIFO: (c) => new FifoCache(c), LRU: (c) => new LruCache(c), LFU: (c) => new LfuCache(c),
};
const scans = withScans();
const workloads: Record<string, { requests: number[]; fromScan?: boolean[] }> = { "steady popularity": { requests: steady() }, "with scans": scans, "shifting popularity": { requests: shifting() } };
const hits: Record<string, Record<string, number>> = {};
for (const [workload, w] of Object.entries(workloads)) {
  hits[workload] = {};
  for (const [name, make] of Object.entries(policies)) (hits[workload] as Record<string, number>)[name] = hitRatio(make(ITEMS * 0.05), w.requests, w.fromScan);
}
const bySize: Record<string, Record<string, number>> = {};
for (const share of [0.01, 0.02, 0.05, 0.1, 0.2]) {
  bySize[String(share)] = {};
  for (const [name, make] of Object.entries(policies)) (bySize[String(share)] as Record<string, number>)[name] = hitRatio(make(ITEMS * share), (workloads["steady popularity"] as { requests: number[] }).requests);
}

// Nanoseconds for one operation, at different capacities: 80% reads, 20% writes, keys spread over twice the capacity.
const speed: Record<string, Record<string, number>> = {};
const kinds: Record<string, (capacity: number) => Cache<number, number>> = {
  "linked list": (c) => new LruCache(c), "Map order": (c) => new LruMapCache(c), "LFU groups": (c) => new LfuCache(c), "scan every entry": (c) => new NaiveLru(c),
};
for (const capacity of [100, 1000, 10_000, 100_000]) {
  speed[String(capacity)] = {};
  for (const [name, make] of Object.entries(kinds)) {
    if (name === "scan every entry" && capacity > 10_000) continue;
    const cache = make(capacity), random = seeded(capacity);
    for (let i = 0; i < capacity; i += 1) cache.put(i, i);
    const ops = name === "scan every entry" ? 20_000 : 400_000;
    const keys = Array.from({ length: ops }, () => Math.floor(random() * capacity * 2)), writes = Array.from({ length: ops }, () => random() < 0.2);
    const start = performance.now();
    for (let i = 0; i < ops; i += 1) { if (writes[i]) cache.put(keys[i] as number, i); else cache.get(keys[i] as number); }
    (speed[String(capacity)] as Record<string, number>)[name] = Math.round(((performance.now() - start) * 1e6) / ops);
  }
}
console.log(JSON.stringify({ hits, bySize, speed }));
