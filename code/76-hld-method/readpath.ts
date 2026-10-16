// The read path of the pastebin with a cache in front of the stores. A hit is answered from memory. A miss reads the
// row from the database and the text from object storage, then puts both into the cache as one entry.
import { LruCache } from "./lru.ts";
import { replay, type Workload } from "./workload.ts";

export type Fill = "on a miss" | "on create too";

export interface ReadPathResult {
  readonly reads: number; // reads counted, after the warm-up
  readonly hits: number;
  readonly hitRatio: number;
  readonly firstReads: number; // counted reads that were the first read of their paste
  readonly hourly: readonly number[]; // hit ratio of each hour after the warm-up
}

export interface ReadPathOptions {
  readonly capacity: number; // entries
  readonly fill: Fill;
  readonly measureFromDay: number; // reads before this are a warm-up and are not counted
  readonly flushAtDay?: number; // empty the cache at this moment, as if its server had restarted
}

export function readPath(w: Workload, o: ReadPathOptions): ReadPathResult {
  const cache = new LruCache<number, true>(o.capacity);
  const seen = new Uint8Array(w.pastes);
  const from = Math.round(o.measureFromDay * 86_400);
  const flushAt = o.flushAtDay === undefined ? -1 : Math.round(o.flushAtDay * 86_400);
  const hours = Math.ceil((w.seconds - from) / 3600);
  const hourReads = new Float64Array(hours), hourHits = new Float64Array(hours);
  let reads = 0, hits = 0, firstReads = 0, flushed = false;
  replay(
    w,
    (id, second) => {
      if (!flushed && flushAt >= 0 && second >= flushAt) { cache.clear(); flushed = true; }
      if (o.fill === "on create too") cache.put(id, true); // the text is in hand when the paste is created
    },
    (id, second) => {
      if (!flushed && flushAt >= 0 && second >= flushAt) { cache.clear(); flushed = true; }
      const hit = cache.get(id) !== undefined;
      if (!hit) cache.put(id, true); // a miss: database and object storage, then fill
      const first = seen[id] === 0;
      seen[id] = 1;
      if (second < from) return;
      reads += 1;
      if (hit) hits += 1;
      if (first) firstReads += 1;
      const h = Math.floor((second - from) / 3600);
      hourReads[h] = (hourReads[h] as number) + 1;
      if (hit) hourHits[h] = (hourHits[h] as number) + 1;
    },
  );
  const hourly = Array.from(hourReads, (n, h) => (n === 0 ? 1 : (hourHits[h] as number) / n));
  return { reads, hits, hitRatio: hits / reads, firstReads, hourly };
}

// The same question for every cache size at once. An LRU cache of capacity C holds the C keys used most recently, so
// a read is a hit exactly when fewer than C other keys were used since this key was last used: its reuse distance.
// One pass measures that distance for every read, with a Fenwick tree that marks the latest use of each key.
export interface Distances {
  readonly distance: Int32Array; // for each counted read: distinct other keys used since this key's last use, or -1
  readonly previousUse: Int32Array; // second of that last use, or -1
  readonly second: Int32Array; // second of the read
}

export function reuseDistances(w: Workload, fill: Fill, measureFromDay: number): Distances {
  const size = w.readIds.length + w.pastes + 1;
  const tree = new Int32Array(size + 1);
  const add = (i: number, v: number) => { for (i += 1; i <= size; i += i & -i) tree[i] = (tree[i] as number) + v; };
  const prefix = (i: number) => { let s = 0; for (i += 1; i > 0; i -= i & -i) s += tree[i] as number; return s; };
  const lastUse = new Int32Array(w.pastes).fill(-1), lastSecond = new Int32Array(w.pastes).fill(-1);
  const from = Math.round(measureFromDay * 86_400);
  const distance: number[] = [], previousUse: number[] = [], second: number[] = [];
  let position = 0;
  const use = (id: number, s: number): number => {
    const last = lastUse[id] as number;
    let d = -1;
    if (last >= 0) {
      d = prefix(position - 1) - prefix(last);
      add(last, -1);
    }
    add(position, 1);
    lastUse[id] = position++;
    return d;
  };
  replay(
    w,
    (id, s) => {
      if (fill === "on create too") { use(id, s); lastSecond[id] = s; }
    },
    (id, s) => {
      const before = lastSecond[id] as number;
      const d = use(id, s);
      lastSecond[id] = s;
      if (s < from) return;
      distance.push(d); previousUse.push(before); second.push(s);
    },
  );
  return { distance: Int32Array.from(distance), previousUse: Int32Array.from(previousUse), second: Int32Array.from(second) };
}

// Hit ratio for a cache of the given capacity, optionally emptied at a moment (a read is then a hit only if the key
// was used again after the cache was emptied). Hours are counted from `fromSecond`.
export function hitRatioOf(d: Distances, capacity: number, fromSecond: number, flushAtSecond = -1): { hitRatio: number; hourly: number[] } {
  let hits = 0;
  const hourHits: number[] = [], hourReads: number[] = [];
  const start = fromSecond;
  for (let i = 0; i < d.distance.length; i += 1) {
    const dist = d.distance[i] as number, s = d.second[i] as number;
    const hit = dist >= 0 && dist < capacity && (flushAtSecond < 0 || s < flushAtSecond || (d.previousUse[i] as number) >= flushAtSecond);
    if (hit) hits += 1;
    const h = Math.floor((s - start) / 3600);
    hourReads[h] = (hourReads[h] ?? 0) + 1;
    if (hit) hourHits[h] = (hourHits[h] ?? 0) + 1;
  }
  const hourly = Array.from(hourReads, (n, h) => (n ? (hourHits[h] ?? 0) / n : 1));
  return { hitRatio: hits / d.distance.length, hourly };
}
