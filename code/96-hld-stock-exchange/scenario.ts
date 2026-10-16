// The book used in the chapter's walkthrough: six resting orders, then a buy that crosses, then a cancel.
import type { Command } from "./book.ts";

export const walkthrough: { readonly label: string; readonly cmd: Command }[] = [
  { label: "sell 200 at 10.01", cmd: { kind: "new", trader: "s1", side: "sell", type: "limit", price: 1001, qty: 200 } },
  { label: "sell 100 at 10.01", cmd: { kind: "new", trader: "s2", side: "sell", type: "limit", price: 1001, qty: 100 } },
  { label: "sell 300 at 10.02", cmd: { kind: "new", trader: "s3", side: "sell", type: "limit", price: 1002, qty: 300 } },
  { label: "sell 500 at 10.03", cmd: { kind: "new", trader: "s1", side: "sell", type: "limit", price: 1003, qty: 500 } },
  { label: "buy 300 at 10.00", cmd: { kind: "new", trader: "b1", side: "buy", type: "limit", price: 1000, qty: 300 } },
  { label: "buy 200 at 9.99", cmd: { kind: "new", trader: "b2", side: "buy", type: "limit", price: 999, qty: 200 } },
  { label: "buy 700 at 10.02", cmd: { kind: "new", trader: "b3", side: "buy", type: "limit", price: 1002, qty: 700 } },
  { label: "cancel order 6", cmd: { kind: "cancel", trader: "b2", order: 6 } },
];
