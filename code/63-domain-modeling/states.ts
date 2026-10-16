import type { Money } from "./money.ts";
import type { OrderLine } from "./order.ts";

// Each state carries exactly the data that exists in that state. A draft has no shipping date to get wrong.
export type Draft = { status: "draft"; lines: OrderLine[] };
export type Placed = { status: "placed"; lines: OrderLine[]; total: Money; placedAt: Date };
export type Shipped = { status: "shipped"; lines: OrderLine[]; total: Money; placedAt: Date; shippedAt: Date; tracking: string };
export type Canceled = { status: "canceled"; canceledAt: Date; reason: string };
export type OrderState = Draft | Placed | Shipped | Canceled;

// Only a placed order can be shipped, and the compiler enforces it: the parameter's type is Placed.
export function ship(order: Placed, tracking: string, now: Date): Shipped {
  return { ...order, status: "shipped", shippedAt: now, tracking };
}

export function describe(order: OrderState): string {
  switch (order.status) {
    case "draft": return `draft with ${order.lines.length} lines`;
    case "placed": return `placed, ${order.total}`;
    case "shipped": return `shipped, tracking ${order.tracking}`;
    case "canceled": return `canceled: ${order.reason}`;
  }
}
