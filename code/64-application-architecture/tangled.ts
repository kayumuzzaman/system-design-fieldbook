// Everything in one handler: the shape most services start with.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";

export function placeOrderHandler(db: DatabaseSync, sendEmail: (to: string, text: string) => void) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const id = req.url?.split("/")[2] ?? "";                                                     // HTTP
    const order = db.prepare("SELECT status, customer FROM orders WHERE id = ?").get(id);        // SQL
    if (!order) { res.writeHead(404).end(); return; }                                            // HTTP
    const lines = db.prepare("SELECT quantity, unit_cents FROM order_lines WHERE order_id = ?").all(id); // SQL
    if (order["status"] !== "draft" || lines.length === 0) { res.writeHead(422).end(); return; } // a business rule
    const total = lines.reduce((sum, l) => sum + Number(l["quantity"]) * Number(l["unit_cents"]), 0); // a business rule
    db.prepare("UPDATE orders SET status = 'placed' WHERE id = ?").run(id);                      // SQL
    sendEmail(String(order["customer"]), `Your order of ${total / 100} is placed`);              // a side effect
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id, total })); // HTTP
  };
}
