import { Money } from "./money.ts";
import type { Order, OrderEvent, OrderId, PhotoId, PrintSize } from "./order.ts";
import { ConflictError, type OrderRepository } from "./repository.ts";

export type PriceList = (size: PrintSize) => Money;
export type Publish = (event: OrderEvent) => Promise<void>;

// Every use case has the same shape: load one aggregate, tell it what to do, save it, publish what happened.
export class OrderService {
  private readonly orders: OrderRepository;
  private readonly priceOf: PriceList;
  private readonly publish: Publish;

  constructor(orders: OrderRepository, priceOf: PriceList, publish: Publish) {
    this.orders = orders;
    this.priceOf = priceOf;
    this.publish = publish;
  }

  addPrints(id: OrderId, photo: PhotoId, size: PrintSize, quantity: number): Promise<void> {
    return this.change(id, (order) => order.addPrints(photo, size, quantity, this.priceOf(size)));
  }

  place(id: OrderId): Promise<void> {
    return this.change(id, (order) => order.place());
  }

  // On a conflict the change is applied again to a fresh copy. The rules are checked again each time.
  private async change(id: OrderId, apply: (order: Order) => void, attempts = 3): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      const order = await this.orders.get(id);
      if (!order) throw new Error(`no order ${id}`);
      apply(order);
      try {
        await this.orders.save(order);
      } catch (error) {
        if (error instanceof ConflictError && attempt < attempts) continue;
        throw error;
      }
      for (const event of order.pullEvents()) await this.publish(event);
      return;
    }
  }
}
