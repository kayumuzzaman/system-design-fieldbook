import { DatabaseSync } from "node:sqlite";
import { Order, type OrderId, type OrderSnapshot } from "../domain/order.ts";
import { ConflictError, type OrderRepository } from "../application/ports.ts";

// A driven adapter: the same port as InMemoryOrders, implemented with SQL. Nothing inside the application imports it.
export class SqliteOrders implements OrderRepository {
  private readonly db: DatabaseSync;
  private readonly loadedAt = new WeakMap<Order, number>();

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, customer TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_lines (
        order_id TEXT NOT NULL REFERENCES orders(id), position INTEGER NOT NULL, photo TEXT NOT NULL, size TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 1), unit_cents INTEGER NOT NULL, PRIMARY KEY (order_id, position));`);
  }

  async get(id: OrderId): Promise<Order | null> {
    const row = this.db.prepare("SELECT id, customer, currency, status, version FROM orders WHERE id = ?").get(id);
    if (!row) return null;
    const lines = this.db.prepare("SELECT photo, size, quantity, unit_cents AS unitCents FROM order_lines WHERE order_id = ? ORDER BY position").all(id);
    const order = Order.fromSnapshot({ ...row, lines } as unknown as OrderSnapshot);
    this.loadedAt.set(order, Number(row["version"]));
    return order;
  }

  // The whole aggregate in one transaction, and only if the version is still the one that was loaded.
  async save(order: Order): Promise<void> {
    const data = order.toSnapshot();
    const expected = this.loadedAt.get(order) ?? 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const written = expected === 0
        ? this.db.prepare("INSERT INTO orders (id, customer, currency, status, version) VALUES (?, ?, ?, ?, 1) ON CONFLICT (id) DO NOTHING").run(data.id, data.customer, data.currency, data.status)
        : this.db.prepare("UPDATE orders SET status = ?, version = version + 1 WHERE id = ? AND version = ?").run(data.status, data.id, expected);
      if (written.changes !== 1) throw new ConflictError(`order ${order.id} was changed by someone else`);
      this.db.prepare("DELETE FROM order_lines WHERE order_id = ?").run(data.id);
      const insert = this.db.prepare("INSERT INTO order_lines (order_id, position, photo, size, quantity, unit_cents) VALUES (?, ?, ?, ?, ?, ?)");
      data.lines.forEach((line, position) => insert.run(data.id, position, line.photo, line.size, line.quantity, line.unitCents));
      this.db.exec("COMMIT");
      this.loadedAt.set(order, expected + 1);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
