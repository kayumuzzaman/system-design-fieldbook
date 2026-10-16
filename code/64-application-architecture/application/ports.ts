import type { Money } from "../domain/money.ts";
import type { Order, OrderEvent, OrderId, PrintSize } from "../domain/order.ts";

// Driven ports: what the application needs from the outside world, stated in its own terms.
export interface OrderRepository {
  get(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>; // rejects with ConflictError if the order changed since it was loaded
}
export interface Publisher {
  publish(event: OrderEvent): Promise<void>;
}
export interface Clock {
  now(): Date;
}
export interface PriceList {
  priceOf(size: PrintSize): Money;
}

export interface Ports {
  orders: OrderRepository;
  publisher: Publisher;
  clock: Clock;
  prices: PriceList;
}

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
