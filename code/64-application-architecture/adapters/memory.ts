import type { Money } from "../domain/money.ts";
import { Order, type OrderEvent, type OrderId, type OrderSnapshot, type PrintSize } from "../domain/order.ts";
import { ConflictError, type Clock, type OrderRepository, type PriceList, type Publisher } from "../application/ports.ts";

// Driven adapters for tests and local runs. Each implements a port with the simplest thing that works.
export class InMemoryOrders implements OrderRepository {
  private readonly rows = new Map<OrderId, { version: number; data: OrderSnapshot }>();
  private readonly loadedAt = new WeakMap<Order, number>();

  async get(id: OrderId): Promise<Order | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const order = Order.fromSnapshot(structuredClone(row.data));
    this.loadedAt.set(order, row.version);
    return order;
  }
  async save(order: Order): Promise<void> {
    const expected = this.loadedAt.get(order) ?? 0;
    const stored = this.rows.get(order.id)?.version ?? 0;
    if (stored !== expected) throw new ConflictError(`order ${order.id} was changed by someone else`);
    this.rows.set(order.id, { version: stored + 1, data: structuredClone(order.toSnapshot()) });
    this.loadedAt.set(order, stored + 1);
  }
}

export class RecordingPublisher implements Publisher {
  readonly events: OrderEvent[] = [];
  async publish(event: OrderEvent): Promise<void> {
    this.events.push(event);
  }
}

export class FixedClock implements Clock {
  private readonly at: Date;
  constructor(iso: string) {
    this.at = new Date(iso);
  }
  now(): Date {
    return this.at;
  }
}

export class FixedPrices implements PriceList {
  private readonly table: Record<PrintSize, Money>;
  constructor(table: Record<PrintSize, Money>) {
    this.table = table;
  }
  priceOf(size: PrintSize): Money {
    return this.table[size];
  }
}
