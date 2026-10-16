import { Order, type CustomerId, type OrderId, type PhotoId, type PrintSize } from "../domain/order.ts";
import { ConflictError, NotFoundError, type Ports } from "./ports.ts";

// What goes in and out of the application is plain data. No HTTP objects come in, no domain objects go out.
export interface OrderView {
  id: string;
  status: string;
  lines: { photo: string; size: string; quantity: number; unitCents: number }[];
  totalCents: number;
  currency: string;
}
export interface Receipt extends OrderView {
  placedAt: string;
}

// The driving port: everything the outside world can ask this application to do.
export interface OrderApp {
  startOrder(input: { orderId: string; customerId: string }): Promise<OrderView>;
  addPrints(input: { orderId: string; photoId: string; size: PrintSize; quantity: number }): Promise<OrderView>;
  placeOrder(input: { orderId: string }): Promise<Receipt>;
  getOrder(input: { orderId: string }): Promise<OrderView>;
}

const view = (order: Order): OrderView => ({
  id: order.id,
  status: order.status,
  lines: order.items.map((line) => ({ photo: line.photo, size: line.size, quantity: line.quantity, unitCents: line.unitPrice.cents })),
  totalCents: order.total.cents,
  currency: order.currency,
});

export function createOrderApp({ orders, publisher, clock, prices }: Ports): OrderApp {
  const load = async (id: string): Promise<Order> => {
    const order = await orders.get(id as OrderId);
    if (!order) throw new NotFoundError(`no order ${id}`);
    return order;
  };

  // Load, tell, save, publish. A conflict means someone else saved first, so start again from their version.
  const change = async (id: string, apply: (order: Order) => void, attempts = 3): Promise<Order> => {
    for (let attempt = 1; ; attempt += 1) {
      const order = await load(id);
      apply(order);
      try {
        await orders.save(order);
      } catch (error) {
        if (error instanceof ConflictError && attempt < attempts) continue;
        throw error;
      }
      for (const event of order.pullEvents()) await publisher.publish(event);
      return order;
    }
  };

  return {
    async startOrder({ orderId, customerId }) {
      const order = new Order(orderId as OrderId, customerId as CustomerId);
      await orders.save(order);
      return view(order);
    },
    async addPrints({ orderId, photoId, size, quantity }) {
      return view(await change(orderId, (order) => order.addPrints(photoId as PhotoId, size, quantity, prices.priceOf(size))));
    },
    async placeOrder({ orderId }) {
      const order = await change(orderId, (o) => o.place());
      return { ...view(order), placedAt: clock.now().toISOString() };
    },
    async getOrder({ orderId }) {
      return view(await load(orderId));
    },
  };
}
