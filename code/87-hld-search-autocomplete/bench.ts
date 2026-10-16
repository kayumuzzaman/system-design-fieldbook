// One timing of stored-list lookups: `node bench.ts`. Times differ between runs and machines.
import { makeCorpus, seeded } from "./corpus.ts";
import { Trie } from "./trie.ts";
const corpus = makeCorpus(100_000);
const trie = new Trie(5);
let t = performance.now();
for (const q of corpus) trie.insert(q.text, q.count);
trie.build();
const buildMs = performance.now() - t;
const random = seeded(9);
const prefixes = Array.from({ length: 200_000 }, () => {
  const q = (corpus[Math.floor(random() * 1000)] as { text: string }).text;
  return q.slice(0, 1 + Math.floor(random() * q.length));
});
let found = 0;
t = performance.now();
for (const p of prefixes) found += trie.complete(p).results.length;
const ms = performance.now() - t;
console.log(JSON.stringify({ node: process.version, buildMs: Math.round(buildMs), lookups: prefixes.length, ms: Math.round(ms), perSecond: Math.round(prefixes.length / (ms / 1000)), found }));
