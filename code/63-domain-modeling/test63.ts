import assert from "node:assert/strict";
import { addToOrder, applyAdminFix, type OrderRecord } from "./anemic.ts";
import { Money } from "./money.ts";
import { DomainError, Order, type CustomerId, type OrderEvent, type OrderId, type PhotoId, type PrintSize } from "./order.ts";
import { ConflictError, InMemoryOrders } from "./repository.ts";
import { OrderService } from "./usecases.ts";
import { describe, ship, type Draft, type Placed } from "./states.ts";

const orderId = (s: string) => s as OrderId, photoId = (s: string) => s as PhotoId, ana = "ana" as CustomerId;
const eur = (cents: number) => Money.of(cents, "EUR");

// --- the anemic model accepts nonsense
const record: OrderRecord = { id: "o1", status: "draft", lines: [], total: 0 };
addToOrder(record, "p1", "10x15", 3, 0.1); addToOrder(record, "p2", "10x15", 3, 0.2);
applyAdminFix(record);
const recomputed = record.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
assert.equal(record.status, "placed"); assert.equal(record.lines.at(-1)?.quantity, -2); assert.notEqual(record.total, recomputed);
console.log(`anemic: stored total ${record.total}, lines add up to ${recomputed}, a line with quantity ${record.lines.at(-1)?.quantity} and size "${record.lines.at(-1)?.size}", status ${record.status}`);

// --- money
assert.notEqual(0.1 + 0.2, 0.3);
assert.ok(eur(10).plus(eur(20)).equals(eur(30)));
assert.notEqual(eur(500), eur(500)); assert.ok(eur(500).equals(eur(500))); // two objects, one value
assert.throws(() => eur(100).plus(Money.of(100, "USD")), /cannot add USD to EUR/);
assert.throws(() => Money.of(9.99, "EUR"), /whole number of cents/);
assert.throws(() => { (eur(100) as { cents: number }).cents = 5; }, TypeError);
const shares = eur(1000).split(3);
assert.deepEqual(shares.map((m) => m.cents), [334, 333, 333]);
assert.ok(shares.reduce((a, b) => a.plus(b)).equals(eur(1000)));
console.log(`money: 0.1 + 0.2 = ${0.1 + 0.2} | 10 + 20 cents equals 30 cents: true | 10.00 EUR in three shares: ${shares.join(", ")}`);

// --- the aggregate enforces its rules
const order = new Order(orderId("o1"), ana);
assert.throws(() => order.place(), /empty order/);
order.addPrints(photoId("p1"), "10x15", 3, eur(25));
order.addPrints(photoId("p1"), "10x15", 2, eur(25)); // merges with the line above
order.addPrints(photoId("p2"), "20x30", 1, eur(450));
assert.equal(order.items.length, 2); assert.equal(order.items[0]?.quantity, 5); assert.equal(String(order.total), "5.75 EUR");
for (const bad of [0, -1, 1.5]) assert.throws(() => order.addPrints(photoId("p3"), "10x15", bad, eur(25)), DomainError);
assert.throws(() => order.addPrints(photoId("p1"), "10x15", 96, eur(25)), /at most 100/);
assert.throws(() => order.addPrints(photoId("p3"), "10x15", 1, Money.of(25, "USD")), /priced in EUR/);
(order.items as unknown[]).push("junk"); assert.equal(order.items.length, 2); // callers get a copy
const full = new Order(orderId("o2"), ana);
for (let i = 0; i < 50; i += 1) full.addPrints(photoId(`p${i}`), "10x15", 1, eur(25));
assert.throws(() => full.addPrints(photoId("p50"), "10x15", 1, eur(25)), /at most 50 lines/);
order.place();
assert.throws(() => order.addPrints(photoId("p3"), "10x15", 1, eur(25)), /cannot add prints to an order that is placed/);
assert.throws(() => order.place(), /cannot place an order that is placed/);
const events = order.pullEvents();
assert.equal(events.length, 1); assert.equal(events[0]?.type, "OrderPlaced"); assert.deepEqual(order.pullEvents(), []);
order.markShipped(); assert.throws(() => order.cancel(), /shipped order cannot be canceled/);
console.log(`aggregate: 2 lines, total ${order.total}, events ${events.map((e) => e.type)}, and 10 invalid operations refused`);

// --- repository: whole aggregates in and out, and a version check
const orders = new InMemoryOrders();
const fresh = new Order(orderId("o7"), ana); fresh.addPrints(photoId("p1"), "13x18", 2, eur(60));
await orders.save(fresh);
const first = await orders.get(orderId("o7")), second = await orders.get(orderId("o7"));
assert.ok(first && second); assert.notEqual(first, second); assert.equal(String(first.total), "1.20 EUR");
first.addPrints(photoId("p2"), "10x15", 1, eur(25)); await orders.save(first);
second.addPrints(photoId("p3"), "10x15", 4, eur(25));
await assert.rejects(orders.save(second), ConflictError);
assert.equal((await orders.get(orderId("o7")))?.items.length, 2); // the losing save changed nothing
assert.equal(await orders.get(orderId("nope")), null);
console.log("repository: two copies loaded at version 1; the first save made version 2; the second was refused with a ConflictError");

// --- the use case retries on conflict, and prices are copied onto the line
let prices: Record<PrintSize, number> = { "10x15": 25, "13x18": 60, "20x30": 450 };
const published: OrderEvent[] = [];
const service = new OrderService(orders, (size) => eur(prices[size]), async (event) => { published.push(event); });
const cart = new Order(orderId("o9"), ana); await orders.save(cart);
let conflicts = 0; const realSave = orders.save.bind(orders);
orders.save = async (o) => { try { await realSave(o); } catch (error) { if (error instanceof ConflictError) conflicts += 1; throw error; } };
await Promise.all([service.addPrints(orderId("o9"), photoId("p1"), "10x15", 4), service.addPrints(orderId("o9"), photoId("p2"), "20x30", 1)]);
const both = await orders.get(orderId("o9"));
assert.equal(both?.items.length, 2); assert.equal(String(both?.total), "5.50 EUR"); assert.equal(conflicts, 1);
prices = { "10x15": 40, "13x18": 80, "20x30": 600 }; // the shop raises its prices
await service.place(orderId("o9"));
const placed = await orders.get(orderId("o9"));
assert.equal(placed?.status, "placed"); assert.equal(String(placed?.total), "5.50 EUR");
assert.equal(published.length, 1); assert.equal(published[0]?.type, "OrderPlaced");
await assert.rejects(service.addPrints(orderId("o9"), photoId("p3"), "10x15", 1), /cannot add prints to an order that is placed/);
console.log(`use case: two simultaneous additions, ${conflicts} conflict, one retry, both kept (${both?.items.length} lines, ${both?.total}); after a price rise the placed order still totals ${placed?.total}; published ${published.map((e) => e.type)}`);

// --- states as types
const line = { photo: photoId("p1"), size: "10x15" as const, quantity: 1, unitPrice: eur(25) };
const draft: Draft = { status: "draft", lines: [line] };
const placedOrder: Placed = { status: "placed", lines: [line], total: eur(25), placedAt: new Date("2026-10-01") };
const shipped = ship(placedOrder, "TRACK-1", new Date("2026-10-03"));
// @ts-expect-error a draft is not a Placed order, so this line does not compile
const wrong = () => ship(draft, "TRACK-2", new Date());
// @ts-expect-error a draft has no shipping date
const none = () => draft.shippedAt;
assert.equal(describe(shipped), "shipped, tracking TRACK-1"); assert.equal(describe(draft), "draft with 1 lines");
void wrong; void none;
console.log("states: ship(placed) ->", describe(shipped), "| ship(draft) and draft.shippedAt are compile errors");
console.log("all assertions passed");
