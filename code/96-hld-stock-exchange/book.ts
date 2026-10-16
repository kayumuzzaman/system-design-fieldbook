// An order book for one symbol: price-time priority, in memory, one thread, no clock.
// Prices are whole ticks (cents). An order's id is the sequence number the sequencer gave it,
// so a smaller id is also an earlier arrival.
export type Side = "buy" | "sell";

export interface NewOrder {
  readonly kind: "new";
  readonly trader: string;
  readonly side: Side;
  readonly type: "limit" | "market";
  readonly price: number;   // ticks; ignored for a market order
  readonly qty: number;     // whole shares
}
export interface CancelOrder { readonly kind: "cancel"; readonly trader: string; readonly order: number }
export type Command = NewOrder | CancelOrder;

export type BookEvent =
  | { readonly type: "accepted"; readonly id: number }
  | { readonly type: "trade"; readonly taker: number; readonly maker: number; readonly side: Side; readonly price: number; readonly qty: number; readonly makerLeft: number }
  | { readonly type: "rested"; readonly id: number; readonly side: Side; readonly price: number; readonly qty: number }
  | { readonly type: "canceled"; readonly id: number; readonly qty: number; readonly why: "requested" | "market order not filled" }
  | { readonly type: "rejected"; readonly id: number; readonly why: string };

export interface RestingOrder { readonly id: number; readonly trader: string; readonly side: Side; readonly price: number; readonly qty: number }

class Resting {
  readonly id: number;
  readonly trader: string;
  readonly side: Side;
  readonly price: number;
  qty: number;
  prev: Resting | null = null;
  next: Resting | null = null;
  constructor(o: RestingOrder) { this.id = o.id; this.trader = o.trader; this.side = o.side; this.price = o.price; this.qty = o.qty; }
}

// All orders at one price, oldest first: a doubly linked list, so a cancel anywhere is O(1).
class Level {
  readonly price: number;
  head: Resting | null = null;
  tail: Resting | null = null;
  total = 0;
  count = 0;
  constructor(price: number) { this.price = price; }
  push(o: Resting): void {
    o.prev = this.tail; o.next = null;
    if (this.tail) this.tail.next = o; else this.head = o;
    this.tail = o; this.total += o.qty; this.count += 1;
  }
  unlink(o: Resting): void {
    if (o.prev) o.prev.next = o.next; else this.head = o.next;
    if (o.next) o.next.prev = o.prev; else this.tail = o.prev;
    o.prev = o.next = null; this.total -= o.qty; this.count -= 1;
  }
}

// One side of the book: levels by price, and the prices kept sorted best first.
class BookSide {
  private readonly side: Side;
  private readonly levels = new Map<number, Level>();
  private readonly prices: number[] = [];
  constructor(side: Side) { this.side = side; }
  private before(a: number, b: number): boolean { return this.side === "buy" ? a > b : a < b; }
  best(): Level | undefined {
    const p = this.prices[0];
    return p === undefined ? undefined : this.levels.get(p);
  }
  private indexOf(price: number): number {   // first position whose price is not better than `price`
    let lo = 0, hi = this.prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.before(this.prices[mid] as number, price)) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  levelAt(price: number): Level {
    let level = this.levels.get(price);
    if (!level) {
      level = new Level(price);
      this.levels.set(price, level);
      this.prices.splice(this.indexOf(price), 0, price);
    }
    return level;
  }
  drop(level: Level): void {
    this.levels.delete(level.price);
    if (this.prices[0] === level.price) this.prices.shift();
    else this.prices.splice(this.indexOf(level.price), 1);
  }
  depth(n = Infinity): [price: number, qty: number, orders: number][] {
    return this.prices.slice(0, n).map((p) => { const l = this.levels.get(p) as Level; return [p, l.total, l.count]; });
  }
  *orders(): Generator<RestingOrder> {
    for (const p of this.prices) {
      for (let o = (this.levels.get(p) as Level).head; o; o = o.next) yield { id: o.id, trader: o.trader, side: o.side, price: o.price, qty: o.qty };
    }
  }
}

export class OrderBook {
  readonly bids = new BookSide("buy");
  readonly asks = new BookSide("sell");
  private readonly byId = new Map<number, Resting>();

  // `id` is the command's sequence number. Every event the command causes is appended to `out`.
  submit(cmd: Command, id: number, out: BookEvent[]): void {
    if (cmd.kind === "cancel") return this.cancel(cmd, id, out);
    if (!Number.isInteger(cmd.qty) || cmd.qty <= 0) { out.push({ type: "rejected", id, why: "quantity must be a whole number above zero" }); return; }
    if (cmd.type === "limit" && (!Number.isInteger(cmd.price) || cmd.price <= 0)) { out.push({ type: "rejected", id, why: "price must be a whole number of ticks" }); return; }
    out.push({ type: "accepted", id });
    const opposite = cmd.side === "buy" ? this.asks : this.bids;
    let left = cmd.qty;
    while (left > 0) {
      const level = opposite.best();
      if (!level) break;
      if (cmd.type === "limit" && (cmd.side === "buy" ? level.price > cmd.price : level.price < cmd.price)) break;
      const maker = level.head as Resting;         // the oldest order at the best price trades first
      const qty = Math.min(left, maker.qty);
      left -= qty; maker.qty -= qty; level.total -= qty;
      out.push({ type: "trade", taker: id, maker: maker.id, side: cmd.side, price: level.price, qty, makerLeft: maker.qty });
      if (maker.qty === 0) {
        level.unlink(maker);
        this.byId.delete(maker.id);
        if (level.count === 0) opposite.drop(level);
      }
    }
    if (left === 0) return;
    if (cmd.type === "market") { out.push({ type: "canceled", id, qty: left, why: "market order not filled" }); return; }
    this.rest({ id, trader: cmd.trader, side: cmd.side, price: cmd.price, qty: left });
    out.push({ type: "rested", id, side: cmd.side, price: cmd.price, qty: left });
  }

  private rest(o: RestingOrder): void {
    const r = new Resting(o);
    (o.side === "buy" ? this.bids : this.asks).levelAt(o.price).push(r);
    this.byId.set(o.id, r);
  }

  private cancel(cmd: CancelOrder, id: number, out: BookEvent[]): void {
    const r = this.byId.get(cmd.order);
    if (!r) { out.push({ type: "rejected", id, why: "no such order resting: filled, canceled or never placed" }); return; }
    if (r.trader !== cmd.trader) { out.push({ type: "rejected", id, why: "not your order" }); return; }
    const side = r.side === "buy" ? this.bids : this.asks;
    const level = side.levelAt(r.price);
    level.unlink(r);
    if (level.count === 0) side.drop(level);
    this.byId.delete(r.id);
    out.push({ type: "canceled", id: r.id, qty: r.qty, why: "requested" });
  }

  // Everything resting, in priority order: bids best first, then asks best first.
  restingOrders(): RestingOrder[] { return [...this.bids.orders(), ...this.asks.orders()]; }
  // Rebuild from a snapshot: orders arrive in priority order, so pushing each onto its level keeps time priority.
  static from(orders: readonly RestingOrder[]): OrderBook {
    const b = new OrderBook();
    for (const o of orders) b.rest(o);
    return b;
  }
  open(): number { return this.byId.size; }
}
