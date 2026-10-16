import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { createHttpServer } from "./adapters/http.ts";
import { runCli } from "./adapters/cli.ts";
import { InMemoryOrders } from "./adapters/memory.ts";
import { SqliteOrders } from "./adapters/sqlite.ts";
import { ConflictError, type OrderRepository } from "./application/ports.ts";
import { Order, type CustomerId, type OrderId } from "./domain/order.ts";
import type { OrderApp } from "./application/orders.ts";
import { repositoryContract } from "./contract.ts";
import { importsIn, layerOf, violations } from "./deps.ts";
import { forTests } from "./main.ts";
import { placeOrderHandler } from "./tangled.ts";

// --- one contract, two adapters
const memoryChecks = await repositoryContract(() => new InMemoryOrders());
const sqliteChecks = await repositoryContract(() => new SqliteOrders(new DatabaseSync(":memory:")));
assert.equal(memoryChecks, sqliteChecks);
console.log(`contract: InMemoryOrders passed ${memoryChecks} checks, SqliteOrders passed the same ${sqliteChecks}`);

// --- the application, with no HTTP and no database
const scenario = async (app: OrderApp) => {
  await app.startOrder({ orderId: "o1", customerId: "ana" });
  await app.addPrints({ orderId: "o1", photoId: "p1", size: "10x15", quantity: 4 });
  await app.addPrints({ orderId: "o1", photoId: "p2", size: "20x30", quantity: 1 });
  return app.placeOrder({ orderId: "o1" });
};
const inMemory = forTests();
const receipt = await scenario(inMemory.app);
assert.deepEqual(receipt, { id: "o1", status: "placed", lines: [{ photo: "p1", size: "10x15", quantity: 4, unitCents: 25 }, { photo: "p2", size: "20x30", quantity: 1, unitCents: 450 }], totalCents: 550, currency: "EUR", placedAt: "2026-10-11T09:00:00.000Z" });
assert.deepEqual(inMemory.publisher.events.map((e) => e.type), ["OrderPlaced"]);
await assert.rejects(inMemory.app.placeOrder({ orderId: "o1" }), /cannot place an order that is placed/);
await assert.rejects(inMemory.app.getOrder({ orderId: "nope" }), /no order nope/);
// the same scenario with the SQL adapter plugged into the same port
const onSqlite = forTests({ orders: new SqliteOrders(new DatabaseSync(":memory:")) });
assert.deepEqual(await scenario(onSqlite.app), receipt);
console.log(`application: placed ${receipt.id} for ${receipt.totalCents} cents at ${receipt.placedAt}; identical receipt with the SQLite adapter`);

// --- driving adapter 1: HTTP, end to end over a real socket
const { app: httpApp } = forTests({ orders: new SqliteOrders(new DatabaseSync(":memory:")) });
const server = createHttpServer(httpApp).listen(0);
const base = `http://localhost:${(server.address() as AddressInfo).port}`;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const statuses = [
  await call("PUT", "/orders/o1", { customerId: "ana" }),
  await call("POST", "/orders/o1/prints", { photoId: "p1", size: "10x15", quantity: 4 }),
  await call("POST", "/orders/o1/prints", { photoId: "p1", size: "poster", quantity: 1 }),   // not a size: 400
  await call("POST", "/orders/o1/prints", { photoId: "p1", size: "10x15", quantity: 0 }),      // breaks a domain rule: 422
  await call("POST", "/orders/o1/place"),
  await call("POST", "/orders/o1/place"),                                                      // already placed: 422
  await call("GET", "/orders/o1"),
  await call("GET", "/orders/nope"),                                                           // 404
];
assert.deepEqual(statuses.map((s) => s.status), [201, 200, 400, 422, 200, 422, 200, 404]);
assert.equal(statuses[4]?.body["totalCents"], 100); assert.equal(statuses[3]?.body["error"], "quantity must be a whole number, at least 1");
server.close();
// a repository that always reports a conflict becomes a 409
const emptyDraft = (id: OrderId) => Order.fromSnapshot({ id, customer: "ana" as CustomerId, currency: "EUR", status: "draft", lines: [] });
const alwaysBusy: OrderRepository = { get: async (id) => emptyDraft(id), save: async () => { throw new ConflictError("busy"); } };
const busy = createHttpServer(forTests({ orders: alwaysBusy }).app).listen(0);
const conflict = await fetch(`http://localhost:${(busy.address() as AddressInfo).port}/orders/o1/prints`, { method: "POST", body: JSON.stringify({ photoId: "p1", size: "10x15", quantity: 1 }) });
assert.equal(conflict.status, 409); busy.close();
console.log("http: statuses", statuses.map((s) => s.status).join(" "), "| conflict ->", conflict.status);

// --- driving adapter 2: a command line, on the same application object
const cli = forTests();
await cli.app.startOrder({ orderId: "o5", customerId: "ben" });
await cli.app.addPrints({ orderId: "o5", photoId: "p3", size: "13x18", quantity: 2 });
const shown = await runCli(cli.app, ["show", "o5"]), placed = await runCli(cli.app, ["place", "o5"]);
assert.equal(shown, "o5: draft, 1 lines, 1.20 EUR"); assert.equal(placed, "o5 placed at 2026-10-11T09:00:00.000Z for 1.20 EUR");
console.log("cli:", shown, "|", placed);

// --- the tangled handler does work, but only with a real database and a real HTTP exchange around it
const db = new DatabaseSync(":memory:"); new SqliteOrders(db);
db.exec("INSERT INTO orders VALUES ('o1', 'ana', 'EUR', 'draft', 1); INSERT INTO order_lines VALUES ('o1', 0, 'p1', '10x15', 4, 25)");
const emails: string[] = [];
const tangled = createServer(placeOrderHandler(db, (to, text) => emails.push(`${to}: ${text}`))).listen(0);
const tangledRes = await fetch(`http://localhost:${(tangled.address() as AddressInfo).port}/orders/o1/place`, { method: "POST" });
assert.equal(tangledRes.status, 200); assert.deepEqual(await tangledRes.json(), { id: "o1", total: 100 }); assert.equal(emails.length, 1);
tangled.close();
console.log("tangled: one handler answered 200 and sent", emails.length, "email; testing it needed a database and a socket");

// --- the dependency rule, checked from the import statements
const edges = importsIn(new URL("./", import.meta.url));
const count = (from: string, to: string) => edges.filter((e) => layerOf(e.from) === from && layerOf(e.to) === to).length;
assert.deepEqual(violations(edges), []);
assert.equal(count("domain", "application") + count("domain", "adapters") + count("application", "adapters"), 0);
assert.deepEqual(violations([...edges, { from: "domain/order.ts", to: "adapters/sqlite.ts" }]), [{ from: "domain/order.ts", to: "adapters/sqlite.ts" }]);
console.log(`imports: ${edges.length} between files; adapters->application ${count("adapters", "application")}, adapters->domain ${count("adapters", "domain")}, application->domain ${count("application", "domain")}, outward 0`);

// --- how long the same scenario takes at two levels
const time = async (runs: number, fn: () => Promise<unknown>) => { const t = performance.now(); for (let i = 0; i < runs; i += 1) await fn(); return Math.round(performance.now() - t); };
const direct = await time(500, () => scenario(forTests().app));
const through = await time(500, async () => {
  const s = createHttpServer(forTests({ orders: new SqliteOrders(new DatabaseSync(":memory:")) }).app).listen(0);
  const url = `http://localhost:${(s.address() as AddressInfo).port}`;
  const post = (path: string, method: string, body?: unknown) => fetch(url + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }).then((r) => r.json());
  await post("/orders/o1", "PUT", { customerId: "ana" });
  await post("/orders/o1/prints", "POST", { photoId: "p1", size: "10x15", quantity: 4 });
  await post("/orders/o1/prints", "POST", { photoId: "p2", size: "20x30", quantity: 1 });
  await post("/orders/o1/place", "POST");
  await new Promise((resolve) => s.close(resolve));
});
console.log(`speed: 500 runs of the scenario, called directly with in-memory adapters ${direct} ms; through HTTP and SQLite ${through} ms`);
console.log("all assertions passed");
