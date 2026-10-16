// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { Rga } from "./rga.ts";
import { simulate } from "./sim.ts";
import { session } from "./typing.ts";

// two replicas: A types "cat"; then A adds "s" while B deletes "c" and types "b" at the start
const a = new Rga("A"), b = new Rga("B");
for (const ch of "cat") b.receive(a.insert(a.length(), ch));
const states: { step: string; A: ReturnType<Rga["dump"]>; B: ReturnType<Rga["dump"]> }[] = [];
const snap = (step: string) => states.push({ step, A: a.dump(), B: b.dump() });
snap("start");
const s1 = a.insert(3, "s"); snap("A inserts s");
const d1 = b.remove(0); snap("B deletes c");
const i1 = b.insert(0, "b"); snap("B inserts b");
a.receive(d1); a.receive(i1); snap("A receives");
b.receive(s1); snap("B receives");

const latency = [10, 25, 50, 100, 200, 300, 500, 1000].map((latencyMs) => {
  const r = simulate({ clients: 10, editsPerClient: 120, meanGapMs: 500, latencyMs, seed: 7, transform: true });
  return { latencyMs, ops: r.ops, transforms: r.transforms };
});
const sites = session(13_000);
const st = (sites[0] as Rga).stats();
console.log(JSON.stringify({ states, texts: [a.text(), b.text()], latency, crdt: { ...st, visible: (sites[0] as Rga).length() } }));
