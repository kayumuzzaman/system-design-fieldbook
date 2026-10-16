// Seeded random order flow: limit orders near a wandering mid price, some that cross it,
// market orders, and cancels of earlier orders (which may already have traded).
import type { Command, Side } from "./book.ts";
import { pick } from "./rng.ts";

export interface Intent {
  readonly symbol: string;
  readonly trader: string;
  readonly kind: "limit" | "market" | "cancel";
  readonly side: Side;
  readonly price: number;
  readonly qty: number;
  readonly cancels: number;      // for a cancel: the index of the earlier intent it cancels
}

export interface FlowOptions {
  readonly symbols: readonly string[];
  readonly traders: readonly string[];
  readonly mid?: number;         // starting price in ticks
  readonly cancelShare?: number;
  readonly marketShare?: number;
  readonly crossShare?: number;  // limit orders priced to trade on arrival
}

export function orderFlow(random: () => number, n: number, o: FlowOptions): Intent[] {
  const mids = new Map(o.symbols.map((s) => [s, o.mid ?? 10_000]));
  const out: Intent[] = [];
  const limits: number[] = [];   // indexes of limit orders, candidates for cancels
  for (let i = 0; i < n; i += 1) {
    const symbol = pick(random, o.symbols);
    const r = random();
    let mid = mids.get(symbol) as number;
    if (r < 0.05) mid += random() < 0.5 ? -1 : 1;
    mids.set(symbol, mid);
    const roll = random();
    const side: Side = random() < 0.5 ? "buy" : "sell";
    const qty = 100 * (1 + Math.floor(random() * 10)) - (random() < 0.2 ? Math.floor(random() * 99) : 0);
    if (roll < (o.cancelShare ?? 0.3) && limits.length > 0) {
      const j = limits[Math.floor(random() * limits.length)] as number;
      const target = out[j] as Intent;
      out.push({ symbol: target.symbol, trader: target.trader, kind: "cancel", side: target.side, price: 0, qty: 0, cancels: j });
      continue;
    }
    const trader = pick(random, o.traders);
    if (roll > 1 - (o.marketShare ?? 0.04)) {
      out.push({ symbol, trader, kind: "market", side, price: 0, qty, cancels: -1 });
      continue;
    }
    const sign = side === "buy" ? -1 : 1;
    const cross = random() < (o.crossShare ?? 0.15);
    const away = cross ? -Math.floor(random() * 4) : 1 + Math.floor(-Math.log(1 - random()) * 3);
    out.push({ symbol, trader, kind: "limit", side, price: Math.max(1, mid + sign * away), qty, cancels: -1 });
    limits.push(out.length - 1);
  }
  return out;
}

// The command a gateway sends for an intent. Cancels name the exchange's id for the earlier order.
export function toCommand(it: Intent, idOf: (index: number) => number): Command {
  if (it.kind === "cancel") return { kind: "cancel", trader: it.trader, order: idOf(it.cancels) };
  return { kind: "new", trader: it.trader, side: it.side, type: it.kind, price: it.price, qty: it.qty };
}
