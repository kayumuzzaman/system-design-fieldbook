// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { makeCorpus, seeded } from "./corpus.ts";
import { Trie } from "./trie.ts";
import { typing } from "./workload.ts";
import { rankOverTime } from "./trends.ts";

// fig-trie: a small trie with the best two completions stored at each node
const small = new Trie(2);
const words: [string, number][] = [["tea", 50], ["ted", 30], ["ten", 80], ["tennis", 120], ["tent", 40], ["to", 200], ["toy", 60], ["tokyo", 150]];
for (const [q, n] of words) small.insert(q, n);
small.build();
const prefixes = new Set<string>([""]);
for (const [q] of words) for (let i = 1; i <= q.length; i += 1) prefixes.add(q.slice(0, i));
const lists = Object.fromEntries([...prefixes].map((p) => [p, small.complete(p).results.map((s) => `${s.text} ${s.score}`)]));

// fig-cost: nodes visited per lookup, by prefix length, over the prefixes users requested
const corpus = makeCorpus(100_000);
const trie = new Trie(5);
for (const q of corpus) trie.insert(q.text, q.count);
trie.build();
const w = typing(trie, corpus, 100_000, seeded(1));
const cost = Array.from({ length: 6 }, (_, i) => {
  let n = 0, subtree = 0, stored = 0;
  for (const [p, c] of w.requests) {
    if (p.length !== i + 1) continue;
    n += c;
    subtree += c * trie.searchSubtree(p).visited;
    stored += c * trie.complete(p).visited;
  }
  return { length: i + 1, requests: n, subtree: Math.round(subtree / n), stored: Math.round(stored / n) };
});

// fig-trend
const trend = rankOverTime({ established: [5000, 3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600], peak: 10_000, hours: 216, k: 5 });
console.log(JSON.stringify({ words, lists, cost, trend }));
