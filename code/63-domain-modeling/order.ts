import { Money, type Currency } from "./money.ts";

// Branded identifiers: all strings at run time, different types at compile time.
export type OrderId = string & { readonly __brand: "OrderId" };
export type CustomerId = string & { readonly __brand: "CustomerId" };
export type PhotoId = string & { readonly __brand: "PhotoId" };

export type PrintSize = "10x15" | "13x18" | "20x30";
export type OrderStatus = "draft" | "placed" | "shipped" | "canceled";

export interface OrderLine {
  readonly photo: PhotoId; // another aggregate, referred to by identifier only
  readonly size: PrintSize;
  readonly quantity: number;
  readonly unitPrice: Money; // the price when the line was added, kept with the order
}

export type OrderEvent =
  | { type: "OrderPlaced"; order: OrderId; customer: CustomerId; total: Money }
  | { type: "OrderCanceled"; order: OrderId };

export class DomainError extends Error {}

// The aggregate root. Lines exist only inside an order and are reached only through it.
export class Order {
  static readonly maxLines = 50;
  static readonly maxPerLine = 100;

  readonly id: OrderId;
  readonly customer: CustomerId;
  readonly currency: Currency;
  private state: OrderStatus = "draft";
  private readonly lines: OrderLine[] = [];
  private readonly events: OrderEvent[] = [];

  constructor(id: OrderId, customer: CustomerId, currency: Currency = "EUR") {
    this.id = id;
    this.customer = customer;
    this.currency = currency;
  }

  get status(): OrderStatus {
    return this.state;
  }
  get items(): readonly OrderLine[] {
    return [...this.lines];
  }
  // Derived every time it is asked for, so it cannot disagree with the lines.
  get total(): Money {
    return this.lines.reduce((sum, line) => sum.plus(line.unitPrice.times(line.quantity)), Money.zero(this.currency));
  }

  addPrints(photo: PhotoId, size: PrintSize, quantity: number, unitPrice: Money): void {
    this.mustBeDraft("add prints to");
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("quantity must be a whole number, at least 1");
    if (unitPrice.currency !== this.currency) throw new DomainError(`this order is priced in ${this.currency}`);
    const at = this.lines.findIndex((line) => line.photo === photo && line.size === size);
    const existing = at >= 0 ? (this.lines[at] as OrderLine).quantity : 0;
    if (existing + quantity > Order.maxPerLine) throw new DomainError(`at most ${Order.maxPerLine} prints of one photo in one size`);
    if (at < 0 && this.lines.length >= Order.maxLines) throw new DomainError(`an order holds at most ${Order.maxLines} lines`);
    const line: OrderLine = { photo, size, quantity: existing + quantity, unitPrice };
    if (at >= 0) this.lines[at] = line;
    else this.lines.push(line);
  }

  place(): void {
    this.mustBeDraft("place");
    if (this.lines.length === 0) throw new DomainError("an empty order cannot be placed");
    this.state = "placed";
    this.events.push({ type: "OrderPlaced", order: this.id, customer: this.customer, total: this.total });
  }

  cancel(): void {
    if (this.state === "shipped") throw new DomainError("a shipped order cannot be canceled");
    if (this.state === "canceled") return; // canceling twice is harmless
    this.state = "canceled";
    this.events.push({ type: "OrderCanceled", order: this.id });
  }

  markShipped(): void {
    if (this.state !== "placed") throw new DomainError(`an order that is ${this.state} cannot be shipped`);
    this.state = "shipped";
  }

  // Hands over what happened since the last call, for publishing after the order is saved.
  pullEvents(): OrderEvent[] {
    return this.events.splice(0);
  }

  private mustBeDraft(action: string): void {
    if (this.state !== "draft") throw new DomainError(`cannot ${action} an order that is ${this.state}`);
  }

  // The stored form: plain data, the whole aggregate at once.
  toSnapshot(): OrderSnapshot {
    return {
      id: this.id, customer: this.customer, currency: this.currency, status: this.state,
      lines: this.lines.map((line) => ({ photo: line.photo, size: line.size, quantity: line.quantity, unitCents: line.unitPrice.cents })),
    };
  }
  static fromSnapshot(data: OrderSnapshot): Order {
    const order = new Order(data.id, data.customer, data.currency);
    for (const line of data.lines) order.lines.push({ photo: line.photo, size: line.size, quantity: line.quantity, unitPrice: Money.of(line.unitCents, data.currency) });
    order.state = data.status;
    return order;
  }
}

export interface OrderSnapshot {
  id: OrderId;
  customer: CustomerId;
  currency: Currency;
  status: OrderStatus;
  lines: { photo: PhotoId; size: PrintSize; quantity: number; unitCents: number }[];
}
