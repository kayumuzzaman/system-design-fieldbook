// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { OrderBook, type BookEvent } from "./book.ts";
import { Engine, type Output } from "./engine.ts";
import { walkthrough } from "./scenario.ts";
import { withoutSequencer } from "./ordering.ts";
import { encode, packets, toMarketData } from "./feed.ts";

// the walkthrough, one command at a time: what happened, and every level with its queue of orders
const book = new OrderBook();
const steps = walkthrough.map((w, i) => {
  const events: BookEvent[] = [];
  book.submit(w.cmd, i + 1, events);
  const queue = (side: "buy" | "sell") => book.restingOrders().filter((o) => o.side === side).map((o) => ({ id: o.id, price: o.price, qty: o.qty }));
  return { seq: i + 1, label: w.label, events, bids: queue("buy"), asks: queue("sell") };
});

// the same commands through an engine, as market data messages and packets of at most three adds
const engine = new Engine();
const outputs: Output[] = [];
walkthrough.forEach((w, i) => engine.apply({ seq: i + 1, time: 34_200_000_000_000 + i * 1000, symbol: "ACME", cmd: w.cmd }, outputs));
const md = toMarketData(outputs);
const pk = packets(md.map((m) => encode(m)), 1, 140).map((p) => ({ first: p.first, bytes: p.bytes.length }));

const ordering = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20].map((j) => withoutSequencer(j, 200, 300, 10_000));
console.log(JSON.stringify({ steps, md, packets: pk, ordering }));
