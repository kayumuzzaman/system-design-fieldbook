// A slow reference matcher: one list of resting orders, sorted again for every incoming order.
// It states price-time priority as plainly as possible, so the fast book can be checked against it.
import type { BookEvent, Command, Side } from "./book.ts";

interface Rest { id: number; trader: string; side: Side; price: number; qty: number }

export class NaiveBook {
  private resting: Rest[] = [];

  submit(cmd: Command, id: number, out: BookEvent[]): void {
    if (cmd.kind === "cancel") {
      const i = this.resting.findIndex((r) => r.id === cmd.order);
      const r = this.resting[i];
      if (!r) { out.push({ type: "rejected", id, why: "no such order resting: filled, canceled or never placed" }); return; }
      if (r.trader !== cmd.trader) { out.push({ type: "rejected", id, why: "not your order" }); return; }
      this.resting.splice(i, 1);
      out.push({ type: "canceled", id: r.id, qty: r.qty, why: "requested" });
      return;
    }
    if (!Number.isInteger(cmd.qty) || cmd.qty <= 0) { out.push({ type: "rejected", id, why: "quantity must be a whole number above zero" }); return; }
    if (cmd.type === "limit" && (!Number.isInteger(cmd.price) || cmd.price <= 0)) { out.push({ type: "rejected", id, why: "price must be a whole number of ticks" }); return; }
    out.push({ type: "accepted", id });
    const crosses = (r: Rest) => r.side !== cmd.side && (cmd.type === "market" || (cmd.side === "buy" ? r.price <= cmd.price : r.price >= cmd.price));
    // best price first; among equal prices, the earliest (smallest id) first
    const queue = this.resting.filter(crosses).sort((a, b) => (a.price - b.price) * (cmd.side === "buy" ? 1 : -1) || a.id - b.id);
    let left = cmd.qty;
    for (const r of queue) {
      if (left === 0) break;
      const qty = Math.min(left, r.qty);
      left -= qty; r.qty -= qty;
      out.push({ type: "trade", taker: id, maker: r.id, side: cmd.side, price: r.price, qty, makerLeft: r.qty });
    }
    this.resting = this.resting.filter((r) => r.qty > 0);
    if (left === 0) return;
    if (cmd.type === "market") { out.push({ type: "canceled", id, qty: left, why: "market order not filled" }); return; }
    this.resting.push({ id, trader: cmd.trader, side: cmd.side, price: cmd.price, qty: left });
    out.push({ type: "rested", id, side: cmd.side, price: cmd.price, qty: left });
  }

  depth(side: Side): [number, number, number][] {
    const m = new Map<number, [number, number]>();
    for (const r of this.resting) if (r.side === side) { const v = m.get(r.price) ?? [0, 0]; m.set(r.price, [v[0] + r.qty, v[1] + 1]); }
    return [...m].sort((a, b) => (side === "buy" ? b[0] - a[0] : a[0] - b[0])).map(([p, [q, n]]) => [p, q, n]);
  }
}
