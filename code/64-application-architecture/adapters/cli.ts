import type { OrderApp } from "../application/orders.ts";

// A second driving adapter for the same application: commands typed by an operator.
export async function runCli(app: OrderApp, args: string[]): Promise<string> {
  const [command, orderId = ""] = args;
  if (command === "show") {
    const order = await app.getOrder({ orderId });
    return `${order.id}: ${order.status}, ${order.lines.length} lines, ${(order.totalCents / 100).toFixed(2)} ${order.currency}`;
  }
  if (command === "place") {
    const receipt = await app.placeOrder({ orderId });
    return `${receipt.id} placed at ${receipt.placedAt} for ${(receipt.totalCents / 100).toFixed(2)} ${receipt.currency}`;
  }
  return "usage: show <order> | place <order>";
}
