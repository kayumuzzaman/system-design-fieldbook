import { createServer, type Server } from "node:http";
import { DomainError } from "../domain/order.ts";
import type { OrderApp } from "../application/orders.ts";
import { ConflictError, NotFoundError } from "../application/ports.ts";

export interface HttpResponse {
  status: number;
  body: unknown;
}

// A driving adapter. Its whole job is translation: a request into a call, a result or an error into a response.
export function createRouter(app: OrderApp) {
  return async (method: string, path: string, body: Record<string, unknown>): Promise<HttpResponse> => {
    const [, resource, orderId, action] = path.split("/");
    if (resource !== "orders" || !orderId) return { status: 404, body: { error: "not found" } };
    try {
      if (method === "PUT" && !action) return { status: 201, body: await app.startOrder({ orderId, customerId: String(body["customerId"]) }) };
      if (method === "GET" && !action) return { status: 200, body: await app.getOrder({ orderId }) };
      if (method === "POST" && action === "prints") {
        const size = body["size"];
        if (size !== "10x15" && size !== "13x18" && size !== "20x30") return { status: 400, body: { error: "size must be 10x15, 13x18 or 20x30" } };
        return { status: 200, body: await app.addPrints({ orderId, photoId: String(body["photoId"]), size, quantity: Number(body["quantity"]) }) };
      }
      if (method === "POST" && action === "place") return { status: 200, body: await app.placeOrder({ orderId }) };
      return { status: 404, body: { error: "not found" } };
    } catch (error) {
      if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
      if (error instanceof DomainError) return { status: 422, body: { error: error.message } };
      if (error instanceof ConflictError) return { status: 409, body: { error: "the order was changed at the same time, try again" } };
      throw error;
    }
  };
}

// The part that touches the network. A web framework would replace these few lines and nothing else.
export function createHttpServer(app: OrderApp): Server {
  const route = createRouter(app);
  return createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    try {
      const { status, body } = await route(req.method ?? "GET", req.url ?? "/", text ? JSON.parse(text) : {});
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    } catch {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "internal error" }));
    }
  });
}
