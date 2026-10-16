// Timings for the chapter, recorded once: `node bench.ts > bench.json`. They differ from run to run and machine to machine.
import { Engine, type Output, type Sequenced } from "./engine.ts";
import { orderFlow, toCommand } from "./flow.ts";
import { seeded } from "./rng.ts";
import { asJson, decode, encode, read, write, type L3 } from "./feed.ts";

const N = 1_000_000;
const symbols = ["ACME", "BOLT", "CRUX", "DYNE", "ECHO", "FLUX", "GRID", "HALO"];
function inputs(seed: number): Sequenced[] {
  const intents = orderFlow(seeded(seed), N, { symbols, traders: ["t1", "t2", "t3", "t4", "t5", "t6"] });
  return intents.map((it, i) => ({ seq: i + 1, time: 34_200_000_000_000 + i * 1000, symbol: it.symbol, cmd: toCommand(it, (j) => j + 1) }));
}
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;

// warm up, so the compiler has optimized the hot paths
{ const e = new Engine(); for (const s of inputs(1)) e.apply(s); }

// throughput: one thread, one engine, every command applied in order
const run = inputs(2);
const engine = new Engine();
const sink: Output[] = [];
let t0 = process.hrtime.bigint();
for (const s of run) { engine.apply(s, sink); if (sink.length > 4096) sink.length = 0; }
const totalNs = Number(process.hrtime.bigint() - t0);

// the same again, timing each command on its own
const each: number[] = [];
const e2 = new Engine();
for (const s of inputs(3)) {
  const a = process.hrtime.bigint();
  e2.apply(s);
  each.push(Number(process.hrtime.bigint() - a));
}
each.sort((a, b) => a - b);
// the cost of reading the clock twice, so it can be seen in the numbers above
const clock: number[] = [];
for (let i = 0; i < 200_000; i += 1) { const a = process.hrtime.bigint(); clock.push(Number(process.hrtime.bigint() - a)); }
clock.sort((a, b) => a - b);

// encoding and decoding one market data message: the ITCH binary layout against JSON
const msg: L3 = { t: "A", time: 34_200_000_123_456, order: 1042, side: "buy", qty: 700, symbol: "ACME", price: 1002 };
const M = 1_000_000;
let keep = 0;
const reused = new DataView(new ArrayBuffer(64));
for (let i = 0; i < 100_000; i += 1) {   // warm up all three
  write(msg, reused);
  keep += decode(encode(msg)).order + read(reused).order + (JSON.parse(asJson(msg)) as { order: number }).order;
}
const time = (f: (i: number) => number) => {
  const t = process.hrtime.bigint();
  for (let i = 0; i < M; i += 1) keep += f(i);
  return Math.round(Number(process.hrtime.bigint() - t) / M);
};
const codecNs = {
  json: time((i) => (JSON.parse(asJson({ ...msg, order: i })) as { order: number }).order),
  binaryNewBuffer: time((i) => decode(encode({ ...msg, order: i })).order),
  binaryReused: time((i) => { write({ ...msg, order: i }, reused); return read(reused).order; }),
};
console.log(JSON.stringify({
  node: process.version, commands: N,
  perSecond: Math.round(N / (totalNs / 1e9)), meanNs: Math.round(totalNs / N),
  eachNs: { p50: pct(each, 0.5), p99: pct(each, 0.99), p999: pct(each, 0.999), max: each[each.length - 1] },
  clockNs: { p50: pct(clock, 0.5) },
  codecNs, keep: keep > 0,
}));
