// Bytes of heap per resting order in this chapter's book. Run with `node --expose-gc memory.ts`.
import { OrderBook, type BookEvent } from "./book.ts";

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with node --expose-gc");
const N = 1_000_000;
gc();
const before = process.memoryUsage().heapUsed;
const book = new OrderBook();
const sink: BookEvent[] = [];
for (let i = 1; i <= N; i += 1) {
  // buys below 10.00 and sells above it, on 2,000 price levels, so nothing trades and everything rests
  const buy = i % 2 === 0;
  book.submit({ kind: "new", trader: `t${i % 50}`, side: buy ? "buy" : "sell", type: "limit", price: buy ? 1000 - (i % 1000) : 1001 + (i % 1000), qty: 100 }, i, sink);
  sink.length = 0;
}
gc();
const after = process.memoryUsage().heapUsed;
console.log(JSON.stringify({ resting: book.open(), bytesPerOrder: Math.round((after - before) / N) }));
