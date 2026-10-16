import assert from "node:assert/strict";
import { makeCorpus, seeded } from "./corpus.ts";
import { better, Trie } from "./trie.ts";
import { byLength, cacheShare, shardSkew, typing } from "./workload.ts";
import { rankOverTime } from "./trends.ts";
import { DecayedCounts } from "./decay.ts";
import { Suggester, type Timer } from "./client.ts";

// --- a small trie, checked by hand
{
  const t = new Trie(2);
  for (const [q, n] of [["tea", 50], ["ted", 30], ["ten", 80], ["tennis", 120], ["tent", 40], ["to", 200], ["toy", 60], ["tokyo", 150]] as const) t.insert(q, n);
  t.build();
  const texts = (p: string) => t.complete(p).results.map((s) => s.text);
  assert.deepEqual(texts("t"), ["to", "tokyo"]);
  assert.deepEqual(texts("te"), ["tennis", "ten"]);
  assert.deepEqual(texts("ten"), ["tennis", "ten"]);
  assert.deepEqual(texts("tea"), ["tea"]);
  assert.deepEqual(texts("x"), []);
  assert.equal(t.complete("te").visited, 3); // root, t, e
  assert.equal(t.searchSubtree("te").visited, 10); // root, t, then all 8 nodes from e down
  // equal scores come back in alphabetical order whatever the insertion order
  const u = new Trie(3);
  for (const q of ["cb", "ca", "cc"]) u.insert(q, 7);
  u.build();
  assert.deepEqual(u.complete("c").results.map((s) => s.text), ["ca", "cb", "cc"]);
}

// --- 100,000 queries: stored lists agree with walking the subtree and with sorting everything
const corpus = makeCorpus(100_000);
const trie = new Trie(5);
for (const q of corpus) trie.insert(q.text, q.count);
trie.build();
{
  const random = seeded(3);
  for (let i = 0; i < 300; i += 1) {
    const q = (corpus[Math.floor(random() * corpus.length)] as { text: string }).text;
    const prefix = q.slice(0, 1 + Math.floor(random() * Math.min(5, q.length)));
    const brute = corpus.filter((c) => c.text.startsWith(prefix)).map((c) => ({ text: c.text, score: c.count })).sort(better).slice(0, 5);
    assert.deepEqual(trie.complete(prefix).results, brute);
    assert.deepEqual(trie.searchSubtree(prefix).results, brute);
  }
  const st = trie.stats();
  const len = corpus.reduce((a, q) => a + q.text.length, 0) / corpus.length;
  console.log(`100,000 queries, ${len.toFixed(1)} characters on average: ${st.nodes.toLocaleString("en-US")} trie nodes (${(st.nodes / 1e5).toFixed(2)} per query), ${st.radixNodes.toLocaleString("en-US")} after merging single-child chains (${(st.radixNodes / 1e5).toFixed(2)} per query), ${st.entries.toLocaleString("en-US")} stored suggestions with k = 5`);
  console.log("nodes visited for one lookup: walking the subtree against reading the stored list");
  for (const p of ["s", "sa", "sal", "sa l"]) console.log(`  "${p}": ${trie.searchSubtree(p).visited.toLocaleString("en-US")} against ${trie.complete(p).visited}`);
}

// --- users typing: how many letters before the query they want is suggested
{
  const w = typing(trie, corpus, 100_000, seeded(1));
  console.log(`100,000 searches: queries of ${w.meanLength.toFixed(1)} characters on average; the query appeared among 5 suggestions after ${w.meanTyped.toFixed(1)} characters on average, in ${(w.pickedShare * 100).toFixed(1)}% of searches`);
  assert.ok(w.meanTyped < w.meanLength / 2);
  const lens = byLength(w.requests, 3);
  console.log(`  requests for prefixes of 1, 2 and 3 characters: ${lens.map((x) => (x * 100).toFixed(0) + "%").join(", ")}; distinct prefixes requested: ${w.requests.size.toLocaleString("en-US")}`);
  console.log(`  share of requests answered by caching the most requested prefixes: ${cacheShare(w.requests, [100, 1000, 10000]).map((c) => `${c.size.toLocaleString("en-US")}: ${(c.share * 100).toFixed(0)}%`).join(", ")}`);
  const sk = shardSkew(w.requests, 8);
  console.log(`  8 shards: busiest shard at ${sk.byFirstLetter.toFixed(2)} times the mean when split by first letter, ${sk.byHash.toFixed(2)} times when split by a hash of the prefix`);
  assert.ok(sk.byHash < sk.byFirstLetter);
}

// --- a trend: how soon each way of counting shows it, and how long it stays
{
  const rows = rankOverTime({ established: [5000, 3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600], peak: 10_000, hours: 216, k: 5 });
  console.log("a new query peaking at 10,000 searches an hour, twice the most popular one under its prefix: hours after it starts");
  for (const r of rows) console.log(`  ${r.strategy.padEnd(34)} first shown ${r.firstShown ?? "never"}, last shown ${r.lastShown ?? "never"}, best rank ${Math.min(...r.ranks) > 5 ? "none" : Math.min(...r.ranks)}`);
  assert.equal(rows[0]?.firstShown, null); // all-time counts never show it
  assert.ok((rows[3]?.firstShown ?? 99) < (rows[2]?.firstShown ?? 0)); // decayed counts react first
  assert.ok((rows[3]?.lastShown ?? 999) < (rows[2]?.lastShown ?? 0)); // and let go first
}
// --- decayed counts updated one search at a time equal the sum of each search's decayed weight
{
  const d = new DecayedCounts(24);
  const random = seeded(12);
  const times = Array.from({ length: 500 }, () => random() * 240).sort((a, b) => a - b);
  for (const t of times) d.add("eclipse", t);
  const exact = times.reduce((a, t) => a + 0.5 ** ((300 - t) / 24), 0);
  assert.ok(Math.abs(d.value("eclipse", 300) - exact) < 1e-9 * exact);
  assert.equal(d.value("unknown", 300), 0);
  d.add("x", 0);
  assert.ok(Math.abs(d.value("x", 24) - 0.5) < 1e-12); // one half-life later, half the weight
}

// --- the browser: one request for a burst of keys, and a late answer is dropped
{
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const timer: Timer = { set: (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id; }, clear: (i) => { timers.delete(i); } };
  const advance = (ms: number) => {
    now += ms;
    for (const [i, t] of [...timers]) if (t.at <= now) { timers.delete(i); t.fn(); }
  };
  const replies: Array<() => void> = [];
  const asked: string[] = [];
  const s = new Suggester((prefix, seq) => new Promise((resolve) => { asked.push(prefix); replies.push(() => resolve({ seq, suggestions: [prefix + "ther"] })); }), timer, 60);
  s.typed("w"); advance(30); s.typed("we"); advance(30); s.typed("wea"); advance(60); // a fast typist
  assert.deepEqual(asked, ["wea"]); // one request for three keys
  s.typed("weat"); advance(60);
  assert.deepEqual(asked, ["wea", "weat"]);
  (replies[1] as () => void)(); // "weat" answers first
  await Promise.resolve();
  (replies[0] as () => void)(); // then "wea", late
  await Promise.resolve();
  assert.deepEqual(s.shown, ["weatther"]); // the newer answer stays on screen
  s.typed("wea"); // backspace: answered from the browser's own cache, no request
  assert.equal(s.requests, 2);
  assert.deepEqual(s.shown, ["weather"]);
  console.log(`the browser: 4 keystrokes and a backspace sent ${s.requests} requests; the late answer was dropped`);
}
console.log("all chapter 87 tests passed");
