import assert from "node:assert/strict";
import { apply, compose, deleteAt, insertAt, transform, type Op } from "./ot.ts";
import { Client, Server } from "./collab.ts";
import { simulate } from "./sim.ts";
import { Rga, type Change } from "./rga.ts";
import { session } from "./typing.ts";
import { seeded } from "./rng.ts";

// describes an operation as "insert x at n" or "delete n at m"
export function describe(op: Op): string {
  let pos = 0;
  const out: string[] = [];
  for (const p of op) {
    if (typeof p === "string") { out.push(`insert "${p}" at ${pos}`); pos += p.length; }
    else if (p > 0) pos += p;
    else out.push(`delete ${-p} at ${pos}`);
  }
  return out.join(", ") || "nothing";
}

// --- the transformation property, and composing, on random pairs
{
  const random = seeded(1);
  const randomOp = (doc: string): Op => {
    const len = doc.length;
    if (len > 0 && random() < 0.4) { const p = Math.floor(random() * len); return deleteAt(len, p, 1 + Math.floor(random() * (len - p))); }
    return insertAt(len, Math.floor(random() * (len + 1)), "XYZ".slice(0, 1 + Math.floor(random() * 3)));
  };
  for (let i = 0; i < 20_000; i += 1) {
    const doc = "abcdefghij".slice(0, Math.floor(random() * 11));
    const a = randomOp(doc), b = randomOp(doc);
    const [a2, b2] = transform(a, b);
    assert.equal(apply(apply(doc, a), b2), apply(apply(doc, b), a2));
    assert.equal(apply(doc, compose(a, b2)), apply(apply(doc, a), b2));
  }
  console.log("20,000 random pairs: transformed in either order, both reach the same text; composing equals applying in turn");
}

// --- the chapter's example: Bob's delete reaches the server first
{
  const start = "Ship it Friday";
  const server = new Server(start);
  const alice = new Client("alice", start, 0), bob = new Client("bob", start, 0);
  const a = alice.edit(insertAt(14, 8, "on ")), b = bob.edit(deleteAt(14, 5, 3));
  assert.equal(alice.doc, "Ship it on Friday"); assert.equal(bob.doc, "Ship Friday");
  const r1 = server.receive(b as never), r2 = server.receive(a as never);
  console.log(`server: revision 1 ${describe(r1.op)}; Alice's insert, made at revision 0, becomes revision 2: ${describe(r2.op)}`);
  bob.receive(r1); bob.receive(r2);
  alice.receive(r1); alice.receive(r2);
  assert.equal(server.doc, "Ship on Friday"); assert.equal(alice.doc, server.doc); assert.equal(bob.doc, server.doc);
  console.log(`all three: "${server.doc}"`);
}

// --- random concurrent editing over a simulated network
{
  let converged = 0, naive = 0;
  for (let s = 0; s < 200; s += 1) {
    const o = { clients: 4, editsPerClient: 30, meanGapMs: 300, latencyMs: 100, seed: s };
    if (simulate({ ...o, transform: true }).converged) converged += 1;
    if (simulate({ ...o, transform: false }).converged) naive += 1;
  }
  console.log(`200 runs of 4 people making 30 edits each, one every 300 ms on average, 100 ms each way: with transformation all copies equal in ${converged}; editing at the original positions, in ${naive}`);
  assert.equal(converged, 200); assert.ok(naive < 10);
  for (const latencyMs of [10, 100, 1000]) {
    const r = simulate({ clients: 10, editsPerClient: 120, meanGapMs: 500, latencyMs, seed: 7, transform: true });
    assert.ok(r.converged);
    console.log(`10 people, 2 edits a second each, ${latencyMs} ms each way: ${r.ops.toLocaleString("en-US")} operations sent, ${(r.transforms / r.ops).toFixed(2)} transformations each at the server`);
  }
}

// --- the CRDT: any order of delivery, the same text everywhere
{
  let ok = 0;
  for (let run = 0; run < 300; run += 1) {
    const random = seeded(100 + run);
    const sites = ["a", "b", "c", "d"].map((s) => new Rga(s));
    const flight: { to: number; c: Change }[] = [];
    const deliver = () => { const m = flight.splice(Math.floor(random() * flight.length), 1)[0] as { to: number; c: Change }; (sites[m.to] as Rga).receive(m.c); };
    for (let step = 0; step < 200; step += 1) {
      if (random() < 0.6 || flight.length === 0) {
        const k = Math.floor(random() * 4), s = sites[k] as Rga, len = s.length();
        const c = len > 0 && random() < 0.3 ? s.remove(Math.floor(random() * len)) : s.insert(Math.floor(random() * (len + 1)), "xyz"[Math.floor(random() * 3)] as string);
        sites.forEach((_, j) => { if (j !== k) flight.push({ to: j, c }); });
        if (random() < 0.1) flight.push({ to: (k + 1) % 4, c });   // sometimes a change arrives twice
      } else deliver();
    }
    while (flight.length > 0) deliver();
    if (sites.every((s) => s.text() === (sites[0] as Rga).text())) ok += 1;
  }
  console.log(`300 runs of 4 replicas, 200 steps each, changes delivered in random order and some twice: identical in ${ok}`);
  assert.equal(ok, 300);
}

// --- two people type a word at the same place at the same time: the words do not interleave
{
  const a = new Rga("a"), b = new Rga("b");
  for (const c of [a.insert(0, "a"), a.insert(1, "b")]) b.receive(c);
  const fromA = [..."hello"].map((ch, i) => a.insert(1 + i, ch)), fromB = [..."world"].map((ch, i) => b.insert(1 + i, ch));
  fromB.forEach((c) => a.receive(c)); fromA.reverse().forEach((c) => b.receive(c));
  assert.equal(a.text(), b.text());
  assert.ok(a.text().includes("hello") && a.text().includes("world"));
  const server = new Server("ab"), x = new Client("x", "ab", 0), y = new Client("y", "ab", 0);
  const sent: (ReturnType<Client["edit"]>)[] = [];
  [..."hello"].forEach((ch, i) => sent.push(x.edit(insertAt(2 + i, 1 + i, ch))));
  [..."world"].forEach((ch, i) => sent.push(y.edit(insertAt(2 + i, 1 + i, ch))));
  const queue = sent.filter((m) => m !== null);
  while (queue.length > 0) {
    const out = server.receive(queue.shift() as never);
    for (const c of [x, y]) { const next = c.receive(out); if (next) queue.push(next); }
  }
  assert.equal(x.doc, server.doc); assert.equal(y.doc, server.doc);
  assert.ok(server.doc.includes("hello") && server.doc.includes("world"));
  console.log(`concurrent words at the same place: CRDT "${a.text()}", OT "${server.doc}"`);
}

// --- what a CRDT keeps: a writing session of 13,000 keystrokes
{
  const sites = session(13_000);
  const st = (sites[0] as Rga).stats(), visible = (sites[0] as Rga).length();
  assert.ok(sites.every((s) => s.text() === (sites[0] as Rga).text()));
  const perChar = (st.items * 18) / visible, perRun = (st.runs * 17 + st.items) / visible;
  console.log(`13,000 keystrokes by 3 people: ${visible.toLocaleString("en-US")} characters shown, ${st.items.toLocaleString("en-US")} kept (${st.tombstones.toLocaleString("en-US")} deleted), in ${st.runs.toLocaleString("en-US")} runs; about ${perChar.toFixed(1)} bytes per character shown if each character is stored with its ids, ${perRun.toFixed(1)} if runs are`);
}
console.log("all collaborative editing tests passed");
