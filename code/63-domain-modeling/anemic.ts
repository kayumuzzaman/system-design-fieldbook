// An "anemic" model: the order is a bag of public fields, and every rule lives in whoever touches it.
export interface OrderRecord {
  id: string;
  status: string;
  lines: { photo: string; size: string; quantity: number; unitPrice: number }[];
  total: number;
}

// One of several places that add to an order. This one remembered two of the rules.
export function addToOrder(order: OrderRecord, photo: string, size: string, quantity: number, unitPrice: number): void {
  if (order.status !== "draft") throw new Error("order is not open");
  if (quantity < 1) throw new Error("bad quantity");
  order.lines.push({ photo, size, quantity, unitPrice });
  order.total += quantity * unitPrice;
}

// Another place, written later by someone else. Nothing stops it.
export function applyAdminFix(order: OrderRecord): void {
  order.lines.push({ photo: "p9", size: "big", quantity: -2, unitPrice: 0.1 });
  order.status = "placed";
}
