// The matching engine: a deterministic state machine over the sequenced input.
// Same input, in the same order, gives the same books and the same output, on any machine.
import { createHash } from "node:crypto";
import { OrderBook, type BookEvent, type Command, type RestingOrder } from "./book.ts";

export interface Sequenced { readonly seq: number; readonly time: number; readonly symbol: string; readonly cmd: Command }
export interface Output { readonly seq: number; readonly time: number; readonly symbol: string; readonly event: BookEvent }
export interface Snapshot { readonly lastSeq: number; readonly outputHash: number; readonly books: Record<string, RestingOrder[]> }

// FNV-1a over 32-bit numbers: a running checksum of everything the engine has said.
function mix(h: number, n: number): number {
  for (let k = 0; k < 4; k += 1) { h = Math.imul(h ^ (n & 255), 16777619) >>> 0; n >>>= 8; }
  return h;
}
const CODE = { accepted: 1, trade: 2, rested: 3, canceled: 4, rejected: 5 } as const;
function digest(h: number, e: BookEvent): number {
  h = mix(h, CODE[e.type]);
  switch (e.type) {
    case "trade": return mix(mix(mix(mix(mix(h, e.taker), e.maker), e.price), e.qty), e.makerLeft);
    case "rested": return mix(mix(mix(h, e.id), e.price), e.qty);
    case "canceled": return mix(mix(h, e.id), e.qty);
    default: return mix(h, e.id);
  }
}

export class Engine {
  private readonly books = new Map<string, OrderBook>();
  private lastSeq = 0;
  private outHash = 2166136261;

  apply(input: Sequenced, out: Output[] = []): Output[] {
    // A gap or a repeat means this replica has not seen exactly the input the others saw: stop, do not guess.
    if (input.seq !== this.lastSeq + 1) throw new Error(`expected input ${this.lastSeq + 1}, got ${input.seq}`);
    this.lastSeq = input.seq;
    let book = this.books.get(input.symbol);
    if (!book) { book = new OrderBook(); this.books.set(input.symbol, book); }
    const events: BookEvent[] = [];
    book.submit(input.cmd, input.seq, events);
    for (const event of events) {
      out.push({ seq: input.seq, time: input.time, symbol: input.symbol, event });
      this.outHash = digest(this.outHash, event);
    }
    return out;
  }

  book(symbol: string): OrderBook | undefined { return this.books.get(symbol); }
  last(): number { return this.lastSeq; }
  outputHash(): string { return this.outHash.toString(16).padStart(8, "0"); }

  // A fingerprint of every resting order, in priority order, in every book.
  stateHash(): string {
    const h = createHash("sha256");
    for (const symbol of [...this.books.keys()].sort()) {
      h.update(symbol);
      for (const o of (this.books.get(symbol) as OrderBook).restingOrders()) h.update(`${o.id},${o.trader},${o.side},${o.price},${o.qty};`);
    }
    return h.digest("hex").slice(0, 12);
  }

  snapshot(): Snapshot {
    const books: Record<string, RestingOrder[]> = {};
    for (const [symbol, book] of this.books) books[symbol] = book.restingOrders();
    return { lastSeq: this.lastSeq, outputHash: this.outHash, books };
  }
  static restore(s: Snapshot): Engine {
    const e = new Engine();
    e.lastSeq = s.lastSeq;
    e.outHash = s.outputHash;
    for (const [symbol, orders] of Object.entries(s.books)) e.books.set(symbol, OrderBook.from(orders));
    return e;
  }
}
