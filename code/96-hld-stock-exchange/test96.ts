import assert from "node:assert/strict";
import { OrderBook, type BookEvent } from "./book.ts";
import { Engine, type Output, type Sequenced } from "./engine.ts";
import { Sequencer } from "./sequencer.ts";
import { NaiveBook } from "./naive.ts";
import { orderFlow, toCommand } from "./flow.ts";
import { seeded } from "./rng.ts";
import { walkthrough } from "./scenario.ts";
import { withoutSequencer } from "./ordering.ts";
import { asJson, decode, encode, packets, Rerequest, Subscriber, toMarketData } from "./feed.ts";

// --- the walkthrough: price first, then time
{
  const book = new OrderBook();
  const events: BookEvent[] = [];
  walkthrough.forEach((w, i) => book.submit(w.cmd, i + 1, events));
  const trades = events.filter((e) => e.type === "trade").map((e) => e.type === "trade" && `${e.maker}:${e.qty}@${e.price}`);
  assert.deepEqual(trades, ["1:200@1001", "2:100@1001", "3:300@1002"]);   // order 1 before order 2 at 10.01; 10.01 before 10.02
  assert.deepEqual(book.bids.depth(), [[1002, 100, 1], [1000, 300, 1]]);   // the rest of the buy now leads the bids; order 6 canceled
  assert.deepEqual(book.asks.depth(), [[1003, 500, 1]]);
  console.log("walkthrough:", trades.join(", "), "| bids", JSON.stringify(book.bids.depth()), "asks", JSON.stringify(book.asks.depth()));
}

// --- validation and cancels
{
  const book = new OrderBook();
  const ev: BookEvent[] = [];
  book.submit({ kind: "new", trader: "x", side: "buy", type: "limit", price: 1000, qty: 0 }, 1, ev);
  book.submit({ kind: "new", trader: "x", side: "buy", type: "limit", price: 10.5, qty: 100 }, 2, ev);
  book.submit({ kind: "new", trader: "x", side: "buy", type: "limit", price: 1000, qty: 100 }, 3, ev);
  book.submit({ kind: "cancel", trader: "y", order: 3 }, 4, ev);   // someone else's order
  book.submit({ kind: "cancel", trader: "x", order: 99 }, 5, ev);  // no such order
  book.submit({ kind: "new", trader: "y", side: "sell", type: "market", price: 0, qty: 250 }, 6, ev); // 100 trades, 150 has nothing to trade with
  book.submit({ kind: "cancel", trader: "x", order: 3 }, 7, ev);   // too late: it traded
  assert.deepEqual(ev.map((e) => e.type), ["rejected", "rejected", "accepted", "rested", "rejected", "rejected", "accepted", "trade", "canceled", "rejected"]);
  assert.equal(book.open(), 0);
}

// --- random flows against the slow reference: same events, same depth, never crossed, no share lost
{
  let commands = 0, trades = 0, rests = 0, cancels = 0, rejects = 0;
  for (let flow = 0; flow < 200; flow += 1) {
    const random = seeded(flow + 1);
    const intents = orderFlow(random, 2000, { symbols: ["ACME"], traders: ["t1", "t2", "t3", "t4"] });
    const fast = new OrderBook(), slow = new NaiveBook();
    const qty = new Map<number, number>(), done = new Map<number, number>();
    intents.forEach((it, i) => {
      const seq = i + 1, cmd = toCommand(it, (j) => j + 1);
      const a: BookEvent[] = [], b: BookEvent[] = [];
      fast.submit(cmd, seq, a); slow.submit(cmd, seq, b);
      assert.deepEqual(a, b);
      if (cmd.kind === "new") qty.set(seq, cmd.qty);
      for (const e of a) {
        if (e.type === "trade") { trades += 1; done.set(e.taker, (done.get(e.taker) ?? 0) + e.qty); done.set(e.maker, (done.get(e.maker) ?? 0) + e.qty); }
        else if (e.type === "canceled") { cancels += 1; done.set(e.id, (done.get(e.id) ?? 0) + e.qty); }
        else if (e.type === "rested") rests += 1;
        else if (e.type === "rejected") rejects += 1;
      }
      const bid = fast.bids.best(), ask = fast.asks.best();
      if (bid && ask) assert.ok(bid.price < ask.price, "the book must never be left crossed");
      if (i % 50 === 0) { assert.deepEqual(fast.bids.depth(), slow.depth("buy")); assert.deepEqual(fast.asks.depth(), slow.depth("sell")); }
      commands += 1;
    });
    // every share of every order is accounted for: traded, canceled, or still resting
    for (const o of fast.restingOrders()) done.set(o.id, (done.get(o.id) ?? 0) + o.qty);
    for (const [id, q] of qty) assert.equal(done.get(id) ?? 0, q, `order ${id}`);
  }
  console.log(`${commands.toLocaleString("en-US")} random commands in 200 flows: identical to the reference matcher; ${trades.toLocaleString("en-US")} trades, ${rests.toLocaleString("en-US")} rested, ${cancels.toLocaleString("en-US")} canceled, ${rejects.toLocaleString("en-US")} rejected; never crossed; every share accounted for`);
}

// --- one order for everything: replicas, replay, snapshot
{
  const random = seeded(42);
  const symbols = ["ACME", "BOLT", "CRUX", "DYNE", "ECHO", "FLUX", "GRID", "HALO"];
  const intents = orderFlow(random, 200_000, { symbols, traders: ["t1", "t2", "t3", "t4", "t5", "t6"] });
  const seq = new Sequencer();
  const primary = new Engine(), backup = new Engine();
  const outputs: Output[] = [];
  seq.attach((s) => primary.apply(s, outputs));
  seq.attach((s) => backup.apply(s));
  let snap = primary.snapshot();
  intents.forEach((it, i) => {
    seq.accept(it.symbol, toCommand(it, (j) => j + 1), 34_200_000_000_000 + i * 10_000);   // 9:30 a.m. plus 10 µs per command
    if (i + 1 === 100_000) snap = primary.snapshot();
  });
  const replayed = new Engine();
  for (const s of seq.journal) replayed.apply(s);
  const restored = Engine.restore(JSON.parse(JSON.stringify(snap)));
  for (const s of seq.journal.slice(snap.lastSeq)) restored.apply(s);
  const rows = { primary, backup, "replayed from the journal": replayed, "snapshot at 100,000 plus the rest": restored };
  for (const [name, e] of Object.entries(rows)) {
    assert.equal(e.stateHash(), primary.stateHash()); assert.equal(e.outputHash(), primary.outputHash());
    console.log(`${name.padEnd(34)} state ${e.stateHash()}  output ${e.outputHash()}  last input ${e.last().toLocaleString("en-US")}`);
  }
  const some = seq.journal[5] as Sequenced;
  assert.throws(() => backup.apply({ ...some, seq: 200_002 }), /expected input 200001/);   // a gap is refused
  assert.throws(() => replayed.apply(seq.journal[199_999] as Sequenced), /expected input 200001/);   // and so is a repeat
  const trades = outputs.filter((o) => o.event.type === "trade").length;
  console.log(`8 symbols, 200,000 commands: ${outputs.length.toLocaleString("en-US")} output events, ${trades.toLocaleString("en-US")} trades; gaps and repeats refused`);
}

// --- without a sequencer: two replicas, each in its own arrival order
{
  const rows = [0, 0.25, 1, 5, 20].map((j) => withoutSequencer(j, 100, 300, 10_000));
  for (const r of rows) console.log(`jitter ${String(r.jitterUs).padStart(4)} µs: replicas disagreed in ${String(r.diverged).padStart(3)} of ${r.runs} runs; ${r.ordersDiffering} of ${r.orders.toLocaleString("en-US")} orders filled differently`);
  assert.equal(rows[0]?.diverged, 0);
  assert.ok((rows[4]?.diverged ?? 0) > 90);
}

// --- market data: ITCH sizes, gap repair, the subscriber's book equals the engine's
{
  const add = encode({ t: "A", time: 34_200_000_123_456, order: 1042, side: "buy", qty: 700, symbol: "ACME", price: 1002 });
  const exe = encode({ t: "E", time: 34_200_000_123_456, order: 1, qty: 200, match: 77 });
  const del = encode({ t: "D", time: 34_200_000_123_456, order: 6 });
  assert.deepEqual([add.length, exe.length, del.length], [36, 31, 19]);
  assert.deepEqual(decode(add), { t: "A", time: 34_200_000_123_456, order: 1042, side: "buy", qty: 700, symbol: "ACME", price: 1002 });

  const random = seeded(7);
  const intents = orderFlow(random, 100_000, { symbols: ["ACME"], traders: ["t1", "t2", "t3", "t4"] });
  const engine = new Engine();
  const outputs: Output[] = [];
  intents.forEach((it, i) => engine.apply({ seq: i + 1, time: 34_200_000_000_000 + i * 10_000, symbol: "ACME", cmd: toCommand(it, (j) => j + 1) }, outputs));
  const md = toMarketData(outputs);
  const bin = md.map((m) => encode(m));
  const binBytes = bin.reduce((a, b) => a + b.length, 0), jsonBytes = md.reduce((a, m) => a + asJson(m).length, 0);
  const counts = { A: 0, E: 0, D: 0 };
  for (const m of md) counts[m.t] += 1;
  console.log(`100,000 commands -> ${md.length.toLocaleString("en-US")} market data messages (${counts.A.toLocaleString("en-US")} add, ${counts.E.toLocaleString("en-US")} executed, ${counts.D.toLocaleString("en-US")} delete); binary ${(binBytes / md.length).toFixed(1)} bytes each, JSON ${(jsonBytes / md.length).toFixed(1)}`);
  const wire = packets(bin, 1).reduce((a, p) => a + p.bytes.length, 0);
  console.log(`in packets of up to 1,400 bytes: ${wire.toLocaleString("en-US")} bytes, ${(wire / 100_000).toFixed(1)} bytes of market data for each command`);
  const book = engine.book("ACME") as OrderBook;
  for (const loss of [0, 0.01, 0.05]) {
    const server = new Rerequest();
    server.record(bin);
    const sub = new Subscriber(server);
    const lossy = seeded(99);
    const all = packets(bin, 1);
    let lost = 0;
    for (const p of all) { if (lossy() < loss) { lost += 1; continue; } sub.receive(p); }
    sub.heartbeat(md.length + 1);
    assert.equal(sub.next(), md.length + 1);
    assert.deepEqual(sub.depth("buy"), book.bids.depth());
    assert.deepEqual(sub.depth("sell"), book.asks.depth());
    console.log(`loss ${(loss * 100).toFixed(0)}%: ${all.length.toLocaleString("en-US")} packets, ${lost} lost, ${sub.gaps} gaps found, ${server.requests} re-requests; subscriber's depth equals the engine's`);
  }
}
console.log("all exchange tests passed");
