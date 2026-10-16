// The simulations behind the chapter's numbers. Every one is seeded, so it prints the same result on every run.
import { Ring, imbalance } from "./ring.ts";
import { Coordinator, Replica } from "./replicas.ts";
import type { Answer, Quorum, Versioned } from "./replicas.ts";
import { Rng } from "./rng.ts";
import { Sim, poisson } from "./sim.ts";
import { LastWriteWins, SiblingRegister } from "./versions.ts";

const percentile = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

// A. How evenly a ring spreads data, with and without virtual nodes, and what a node joining moves.
export function spread(nodes = 100, vnodeCounts = [1, 4, 16, 64, 256], n = 3) {
  return vnodeCounts.map((v) => {
    const ring = new Ring(nodes, v);
    const shares = ring.shares(n);
    const bigger = new Ring(nodes + 1, v);
    const after = bigger.shares(n);
    // The share of all stored data that has to move when one node joins: what the new node now holds.
    const moved = after[nodes]!;
    return {
      vnodes: v,
      imbalance: imbalance(shares),
      smallest: Math.min(...shares) / (1 / nodes),
      moved,
      sourcesForRebuild: ring.sourcesFor(0, n).length,
      sharedPairs: ring.sharedPairs(n),
    };
  });
}

// B. Quorums: one key written every 10 ms, read 1,000 times a second, with every message delayed a little
// and 1% delayed by 20 ms. A read is stale if it returns a version older than the newest write that had
// been confirmed when the read began.
export function quorums(configs: [number, number][] = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3]], seconds = 20, oneDown = false) {
  return configs.map(([w, r]) => {
    const sim = new Sim();
    const rng = new Rng(51);
    const q: Quorum = { n: 3, w, r, sloppy: false, readRepair: false, timeoutMs: 100 };
    const coordinator = new Coordinator(sim, rng, q);
    const replicas = ["A", "B", "C"].map((x) => new Replica(x));
    if (oneDown) replicas[2]!.up = false;
    let confirmed = 0; // the newest version a client has been told is written
    let version = 0;
    const writeMs: number[] = [], readMs: number[] = [];
    let writesFailed = 0, writes = 0, reads = 0, readsFailed = 0, stale = 0;
    const end = seconds * 1000;
    const tick = () => {
      if (sim.now >= end) return;
      const v: Versioned = { version: ++version };
      writes++;
      coordinator.write(replicas, "k", v, (a: Answer) => {
        if (!a.ok) return void writesFailed++;
        writeMs.push(a.ms);
        confirmed = Math.max(confirmed, v.version);
      });
      sim.after(10, tick);
    };
    sim.at(0, tick);
    poisson(sim, new Rng(52), 1000, 100, end, () => {
      const floor = confirmed;
      reads++;
      coordinator.read(replicas, "k", (a) => {
        if (!a.ok) return void readsFailed++;
        readMs.push(a.ms);
        if ((a.value?.version ?? 0) < floor) stale++;
      });
    });
    sim.run(Infinity);
    return {
      w, r,
      staleShare: stale / Math.max(1, reads - readsFailed),
      writeP99: percentile(writeMs, 0.99),
      readP99: percentile(readMs, 0.99),
      writesFailedShare: writesFailed / writes,
      readsFailedShare: readsFailed / reads,
    };
  });
}

// C. Two of a key range's three home replicas are cut off for 30 seconds. With a strict quorum, writes fail;
// with a sloppy one, stand-ins take them with hints, which are delivered 10 seconds after the replicas return.
export function partition(sloppy: boolean, readRepair: boolean, keys = 1000) {
  const sim = new Sim();
  const rng = new Rng(61);
  const q: Quorum = { n: 3, w: 2, r: 2, sloppy, readRepair, timeoutMs: 50 };
  const c = new Coordinator(sim, rng, q);
  const [A, B, C, D, E] = ["A", "B", "C", "D", "E"].map((x) => new Replica(x)) as [Replica, Replica, Replica, Replica, Replica];
  const preference = [A, B, C, D, E];
  const cut = 10_000, healed = 40_000, detectMs = 2_000, hintDelayMs = 10_000, end = 70_000;
  const newest = new Map<string, number>(); // newest version confirmed for each key
  let version = 0;
  const seconds = Array.from({ length: end / 1000 }, () => ({ writes: 0, writesOk: 0, reads: 0, readsOk: 0, stale: 0 }));
  let failedButStored = 0; // reads that returned a version whose write the client was told had failed
  const failedVersions = new Set<number>();
  poisson(sim, new Rng(62), 200, 0, end, () => {
    const key = `k${new Rng(version + 7).below(keys)}`;
    const v = { version: ++version };
    const s = seconds[Math.floor(sim.now / 1000)]!;
    s.writes++;
    c.write(preference, key, v, (a) => {
      if (a.ok) { s.writesOk++; newest.set(key, Math.max(newest.get(key) ?? 0, v.version)); }
      else failedVersions.add(v.version);
    });
  });
  const pick = new Rng(63);
  poisson(sim, new Rng(64), 1000, 0, end, () => {
    const key = `k${pick.below(keys)}`;
    const floor = newest.get(key) ?? 0;
    const s = seconds[Math.floor(sim.now / 1000)]!;
    s.reads++;
    c.read(preference, key, (a) => {
      if (!a.ok) return;
      s.readsOk++;
      const got = a.value?.version ?? 0;
      if (got < floor) s.stale++;
      if (failedVersions.has(got)) failedButStored++;
    });
  });
  sim.at(cut, () => { A.up = false; B.up = false; });
  sim.at(cut + detectMs, () => { c.believedDown.add(A); c.believedDown.add(B); });
  sim.at(healed, () => { A.up = true; B.up = true; });
  sim.at(healed + detectMs, () => { c.believedDown.delete(A); c.believedDown.delete(B); });
  sim.at(healed + detectMs + hintDelayMs, () => { c.deliverHints(D); c.deliverHints(E); });
  sim.run(Infinity);
  const sum = (from: number, to: number, f: (s: (typeof seconds)[number]) => number) => seconds.slice(from, to).reduce((a, s) => a + f(s), 0);
  const cutS = cut / 1000, healS = healed / 1000, hintS = (healed + detectMs + hintDelayMs) / 1000;
  return {
    sloppy, readRepair,
    writesOkDuring: sum(cutS + 2, healS, (s) => s.writesOk) / sum(cutS + 2, healS, (s) => s.writes),
    readsOkDuring: sum(cutS + 2, healS, (s) => s.readsOk) / sum(cutS + 2, healS, (s) => s.reads),
    staleDuring: sum(cutS + 2, healS, (s) => s.stale) / Math.max(1, sum(cutS + 2, healS, (s) => s.readsOk)),
    staleAfter: sum(healS + 2, hintS, (s) => s.stale) / Math.max(1, sum(healS + 2, hintS, (s) => s.readsOk)),
    staleAfterHints: sum(hintS + 1, end / 1000, (s) => s.stale) / Math.max(1, sum(hintS + 1, end / 1000, (s) => s.readsOk)),
    failedButStored,
    perSecond: seconds.map((s) => ({ writeOk: s.writes ? s.writesOk / s.writes : 1, readOk: s.reads ? s.readsOk / s.reads : 1, stale: s.readsOk ? s.stale / s.readsOk : 0 })),
  };
}

// D. Anti-entropy: two replicas of a million keys differ in a few. Compare Merkle trees from the root down,
// and count what crosses the network: hashes compared, and the keys of the leaves found to differ.
export function merkle(keys = 1_000_000, depths = [8, 12, 16, 20], diffs = [1, 10, 100, 1000], seed = 71) {
  const mix = (x: number) => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  };
  const leafOf = (key: number, depth: number) => mix(key * 2654435761) >>> (32 - depth); // keys spread over leaves by hash
  const rows: { depth: number; diffs: number; hashes: number; keysSent: number; bytes: number }[] = [];
  for (const depth of depths) {
    const leaves = 2 ** depth;
    const count = new Uint32Array(leaves);
    for (let k = 0; k < keys; k++) count[leafOf(k, depth)]!++;
    for (const d of diffs) {
      const rng = new Rng(seed + d);
      const differing = new Set<number>();
      while (differing.size < d) differing.add(rng.below(keys));
      // A leaf differs if it holds a differing key; an inner node differs if either child does.
      const bad = new Uint8Array(2 * leaves); // heap layout: node i has children 2i and 2i + 1, leaves at leaves .. 2 leaves - 1
      for (const k of differing) bad[leaves + leafOf(k, depth)] = 1;
      for (let i = leaves - 1; i >= 1; i--) bad[i] = bad[2 * i]! | bad[2 * i + 1]!;
      let hashes = 0, keysSent = 0;
      const visit = (i: number): void => {
        hashes++; // both sides send this node's hash
        if (!bad[i]) return;
        if (i >= leaves) { keysSent += count[i - leaves]!; return; }
        visit(2 * i); visit(2 * i + 1);
      };
      visit(1);
      rows.push({ depth, diffs: d, hashes, keysSent, bytes: 2 * (hashes * 32 + keysSent * 40) });
    }
  }
  return { keys, naiveBytes: keys * 40, rows };
}

// E. A shopping cart that two clients update at the same time: each reads the cart, adds an item a few
// milliseconds later, and writes it back. Last write wins keeps the write with the larger timestamp, taken
// from each client's clock, which is off by a fixed amount; version vectors keep concurrent writes as siblings.
export function cart(addsEach = 500, meanGapMs = 40, thinkMs = 10, skewMs = [30, -20], seed = 81) {
  const sim = new Sim();
  const rng = new Rng(seed);
  const lww = new LastWriteWins();
  const vv = new SiblingRegister();
  let maxSiblings = 0, laterLost = 0;
  let lastWinner = { client: -1, realAt: -1 };
  for (let c = 0; c < 2; c++) {
    let done = 0;
    const next = (): void => {
      if (done >= addsEach) return;
      sim.after(-meanGapMs * Math.log(1 - rng.float()), () => {
        const fromLww = lww.read(), fromVv = vv.read();
        const item = `client ${c} item ${done}`;
        sim.after(thinkMs * rng.float(), () => {
          const at = sim.now + skewMs[c]!;
          const before = lastWinner;
          lww.write(at, new Set([...fromLww.items, item]));
          if (lww.read().items.has(item)) lastWinner = { client: c, realAt: sim.now };
          else if (before.realAt < sim.now) laterLost++; // this write came later in real time, and lost
          vv.write(`client ${c}`, fromVv.context, new Set([...fromVv.items, item]));
          maxSiblings = Math.max(maxSiblings, vv.count);
          done++;
          next();
        });
      });
    };
    next();
  }
  sim.run(Infinity);
  return { added: 2 * addsEach, keptByLww: lww.read().items.size, keptByVectors: vv.read().items.size, maxSiblings, laterLost };
}
