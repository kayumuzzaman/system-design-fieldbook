import assert from "node:assert/strict";
import { Ring, imbalance } from "./ring.ts";
import { SiblingRegister, LastWriteWins, descends } from "./versions.ts";
import * as X from "./experiments.ts";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const f2 = (x: number) => x.toFixed(2);

// The ring: every key has n distinct replicas, and the shares add up to the whole.
{
  const ring = new Ring(10, 8);
  for (let k = 0; k < 1000; k++) {
    const r = ring.replicas(`key-${k}`, 3);
    assert.equal(new Set(r).size, 3);
  }
  const total = ring.shares(3).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  console.log("ring: 1,000 keys each get 3 distinct replicas; the shares of 10 nodes add up to 1");
}

// A. Spread over 100 nodes, three copies of everything.
for (const r of X.spread()) {
  console.log(`${r.vnodes} tokens per node: largest share ${f2(r.imbalance)} times the average, smallest ${f2(r.smallest)} times; ` +
    `a joining node takes ${pct(r.moved, 2)} of the data; a failed node's data is copied from ${r.sourcesForRebuild} nodes; ${pct(r.sharedPairs)} of pairs of nodes share a key`);
}
{
  const s = X.spread(100, [1, 256]);
  assert.ok(s[0]!.imbalance > 2 && s[1]!.imbalance < 1.2);
  // The calculator's default ring: 75 nodes, 16 tokens each.
  const ring = new Ring(75, 16);
  console.log(`calculator default, 75 nodes with 16 tokens: largest share ${f2(imbalance(ring.shares(3)))} times the average, rebuild from ${ring.sourcesFor(0, 3).length} nodes, ${pct(ring.sharedPairs(3))} of pairs share a key, fullest node ${f2(Math.max(...ring.shares(3)) * 300)} TB of 300 TB stored`);
}

// B. Quorums with all three replicas up, then with one down.
for (const [label, rows] of [["all up", X.quorums()], ["one replica down", X.quorums(undefined, 20, true)]] as const) {
  for (const r of rows) {
    console.log(`${label}, W=${r.w} R=${r.r}: stale reads ${pct(r.staleShare, 2)}, 99th percentile write ${f2(r.writeP99)} ms, read ${f2(r.readP99)} ms, ` +
      `failed writes ${pct(r.writesFailedShare, 0)}, failed reads ${pct(r.readsFailedShare, 0)}`);
    if (r.w + r.r > 3) assert.equal(r.staleShare, 0, "overlapping quorums never return an older version");
  }
}

// C. Two home replicas cut off for 30 seconds.
for (const r of [X.partition(false, false), X.partition(true, false), X.partition(true, true)]) {
  console.log(`${r.sloppy ? "sloppy" : "strict"} quorum${r.readRepair ? " with read repair" : ""}: writes accepted during the cut ${pct(r.writesOkDuring)}, reads answered ${pct(r.readsOkDuring)}, of them stale ${pct(r.staleDuring)}; ` +
    `stale reads after it heals, before hints arrive ${pct(r.staleAfter)}, after ${pct(r.staleAfterHints)}; reads returning a write reported as failed: ${r.failedButStored}`);
}

// D. Merkle trees over a million keys.
{
  const m = X.merkle();
  for (const r of m.rows) console.log(`Merkle depth ${r.depth}, ${r.diffs} keys differ: ${r.hashes} hashes compared, ${r.keysSent} keys sent, ${(r.bytes / 1000).toFixed(1)} KB, against ${(m.naiveBytes / 1e6).toFixed(0)} MB for every key`);
  const at16 = m.rows.find((r) => r.depth === 16 && r.diffs === 10)!;
  assert.ok(at16.bytes < m.naiveBytes / 1000);
}

// E. The shopping cart.
{
  const reg = new SiblingRegister();
  reg.write("a", {}, new Set(["x"]));
  const seen = reg.read();
  reg.write("b", {}, new Set(["y"])); // did not see "x": a sibling
  assert.equal(reg.count, 2);
  reg.write("a", reg.read().context, new Set([...reg.read().items, "z"])); // saw both: replaces both
  assert.equal(reg.count, 1);
  assert.deepEqual([...reg.read().items].sort(), ["x", "y", "z"]);
  assert.ok(descends(reg.read().context, seen.context));
  const lww = new LastWriteWins();
  lww.write(10, new Set(["x"]));
  lww.write(5, new Set(["y"]));
  assert.deepEqual([...lww.read().items], ["x"]);
  const c = X.cart();
  console.log(`cart: ${c.added} items added by two clients; last write wins kept ${c.keptByLww}, version vectors ${c.keptByVectors} ` +
    `(at most ${c.maxSiblings} siblings); ${c.laterLost} times the later write lost because the other client's clock ran ahead`);
  assert.equal(c.keptByVectors, c.added);
}
console.log("all tests passed");
