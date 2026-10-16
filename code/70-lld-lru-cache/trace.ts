// Prints, as JSON, the contents of a small LRU cache and a small LFU cache after each of a series of operations.
// The chapter's two step-by-step figures are drawn from this.
import { LruCache } from "./lru.ts";
import { LfuCache } from "./lfu.ts";

type Op = ["put", string, number] | ["get", string];
const run = <C extends { get(k: string): number | undefined; put(k: string, v: number): void }>(cache: C, ops: Op[], view: (c: C) => unknown) =>
  ops.map((op) => {
    const before = new Set(JSON.stringify(view(cache)).match(/[a-z]/g) ?? []);
    const result = op[0] === "get" ? cache.get(op[1]) : (cache.put(op[1], op[2]), undefined);
    const after = new Set(JSON.stringify(view(cache)).match(/[a-z]/g) ?? []);
    return { op: op[0] === "get" ? `get("${op[1]}")` : `put("${op[1]}", ${op[2]})`, result: op[0] === "get" ? (result ?? "miss") : null, evicted: [...before].filter((k) => !after.has(k)), view: view(cache) };
  });

const lruOps: Op[] = [["put", "a", 1], ["put", "b", 2], ["put", "c", 3], ["get", "a"], ["put", "d", 4], ["get", "b"], ["put", "e", 5]];
const lfuOps: Op[] = [["put", "a", 1], ["put", "b", 2], ["put", "c", 3], ["get", "a"], ["get", "a"], ["get", "b"], ["put", "d", 4], ["get", "d"], ["put", "e", 5]];
console.log(JSON.stringify({ lru: run(new LruCache<string, number>(3), lruOps, (c) => c.keys()), lfu: run(new LfuCache<string, number>(3), lfuOps, (c) => c.snapshot()) }));
