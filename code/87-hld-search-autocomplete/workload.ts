import type { Query } from "./corpus.ts";
import { zipfPicker } from "./corpus.ts";
import type { Trie } from "./trie.ts";

// Users search for queries in proportion to their popularity, typing one letter at a time and
// stopping as soon as the query they want is among the suggestions shown.
export function typing(trie: Trie, corpus: readonly Query[], searches: number, random: () => number) {
  const pick = zipfPicker(corpus.length, 1, random); // counts in the corpus fall off as 1 / rank
  const requests = new Map<string, number>();
  let typed = 0;
  let length = 0;
  let picked = 0;
  for (let i = 0; i < searches; i += 1) {
    const q = (corpus[pick()] as Query).text;
    length += q.length;
    let n = 0;
    for (const end of Array.from({ length: q.length }, (_, j) => j + 1)) {
      const prefix = q.slice(0, end);
      n = end;
      requests.set(prefix, (requests.get(prefix) ?? 0) + 1);
      if (trie.complete(prefix).results.some((s) => s.text === q)) {
        picked += 1;
        break;
      }
    }
    typed += n;
  }
  return { searches, meanLength: length / searches, meanTyped: typed / searches, pickedShare: picked / searches, requests };
}

// The share of all requests answered by a cache holding the most requested prefixes.
export function cacheShare(requests: Map<string, number>, sizes: number[]) {
  const counts = [...requests.values()].sort((a, b) => b - a);
  const total = counts.reduce((a, b) => a + b, 0);
  return sizes.map((size) => ({ size, share: counts.slice(0, size).reduce((a, b) => a + b, 0) / total }));
}

// Requests by prefix length: short prefixes are typed by everyone.
export function byLength(requests: Map<string, number>, upTo: number) {
  const out = Array.from({ length: upTo }, () => 0);
  let total = 0;
  for (const [p, n] of requests) {
    total += n;
    if (p.length <= upTo) out[p.length - 1] = (out[p.length - 1] as number) + n;
  }
  return out.map((n) => n / total);
}

// Load on each of `shards` servers when prefixes are assigned by their first letter (a range
// split) or by a hash of the whole prefix. Returns the busiest shard's load divided by the mean.
export function shardSkew(requests: Map<string, number>, shards: number) {
  const byLetter = new Map<string, number>();
  const byHash = Array.from({ length: shards }, () => 0);
  let total = 0;
  for (const [p, n] of requests) {
    total += n;
    const first = p[0] as string;
    byLetter.set(first, (byLetter.get(first) ?? 0) + n);
    let h = 2166136261;
    for (let i = 0; i < p.length; i += 1) h = Math.imul(h ^ p.charCodeAt(i), 16777619) >>> 0;
    byHash[h % shards] = (byHash[h % shards] as number) + n;
  }
  // first letters are assigned to shards in alphabetical runs of roughly equal numbers of letters
  const letters = [...byLetter.keys()].sort();
  const ranges = Array.from({ length: shards }, () => 0);
  letters.forEach((l, i) => {
    const s = Math.floor((i * shards) / letters.length);
    ranges[s] = (ranges[s] as number) + (byLetter.get(l) as number);
  });
  const mean = total / shards;
  return { letters: letters.length, byFirstLetter: Math.max(...ranges) / mean, byHash: Math.max(...byHash) / mean, ranges: ranges.map((r) => r / total) };
}
