import { Order, type OrderId, type OrderSnapshot } from "./order.ts";

// A repository looks like a collection of whole aggregates. Callers never see tables or queries.
export interface OrderRepository {
  get(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export class ConflictError extends Error {}

// Good enough for tests, and it enforces the same rule a database implementation would:
// a save succeeds only if nobody else has saved this order since it was loaded.
export class InMemoryOrders implements OrderRepository {
  private readonly rows = new Map<OrderId, { version: number; data: OrderSnapshot }>();
  private readonly loadedAt = new WeakMap<Order, number>(); // the version each order object was read at

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
    if (stored !== expected) throw new ConflictError(`order ${order.id} was changed by someone else (version ${stored}, expected ${expected})`);
    this.rows.set(order.id, { version: stored + 1, data: structuredClone(order.toSnapshot()) });
    this.loadedAt.set(order, stored + 1);
  }
}
