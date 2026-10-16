import assert from "node:assert/strict";
import { payForOrder, toHttp } from "./result.ts";
import { AppError, ConflictError, NotFoundError, RuleError, savingOrder, toResponse, type LogEntry } from "./errors.ts";
import { withAwait, withoutAwait } from "./awaiting.ts";
import { chaseLateOrder, isLate, type Shipment } from "./late.ts";
import { Checkout, dummyAudit, FakeGateway, SpyMailer, stubGateway } from "./doubles.ts";
import { checkNaiveSplit, checkSplit } from "./property.ts";

// --- results: every outcome is a value
const approve = async () => ({ status: "ok" as const, reference: "ref-1" });
const outcomes = [
  toHttp(await payForOrder("o1", approve)),
  toHttp(await payForOrder("o1", approve)),                                                    // paid a moment ago
  toHttp(await payForOrder("o9", approve)),                                                    // no such order
  toHttp(await payForOrder("o3", async () => ({ status: "declined", reason: "expired" }))),
  toHttp(await payForOrder("o3", async () => ({ status: "down" }))),
].map((r) => r.status);
assert.deepEqual(outcomes, [200, 409, 404, 402, 503]);
const declined = await payForOrder("o2", approve);
assert.deepEqual(declined, { ok: false, error: { kind: "already-paid", orderId: "o2" } });
// @ts-expect-error the value cannot be read until the result has been checked
const unchecked = () => declined.value;
void unchecked;
console.log("result: statuses", outcomes.join(" "), "| an error is an ordinary value:", JSON.stringify(declined));

// --- error classes, causes and the outer handler
const logs: LogEntry[] = [];
const low = new Error("UNIQUE constraint failed: orders.id"); low.name = "SqliteError";
const wrapped = await savingOrder("o1", async () => { throw low; }).catch((e: unknown) => e);
assert.ok(wrapped instanceof ConflictError && wrapped instanceof AppError && wrapped instanceof Error);
assert.equal(wrapped.name, "ConflictError"); assert.equal(wrapped.cause, low); assert.equal(wrapped.code, "conflict");
await assert.rejects(savingOrder("o1", async () => { throw new Error("disk I/O error"); }), /disk I\/O error/); // not translated
const expected = toResponse(wrapped, (e) => logs.push(e));
assert.deepEqual(expected, { status: 409, body: { type: "https://photos.example/problems/conflict", title: "ConflictError", status: 409, detail: "order o1 already exists" } });
assert.deepEqual(logs[0], { level: "info", code: "conflict", message: "order o1 already exists", causes: ["SqliteError: UNIQUE constraint failed: orders.id"] });
const bug = (() => { try { return (undefined as unknown as { total: number }).total; } catch (e) { return e; } })();
const unexpected = toResponse(bug, (e) => logs.push(e));
assert.deepEqual(unexpected, { status: 500, body: { type: "https://photos.example/problems/internal", title: "Internal error", status: 500 } });
assert.equal(logs[1]?.level, "error"); assert.match(logs[1]?.message ?? "", /Cannot read properties of undefined/); assert.ok(logs[1]?.stack?.includes("test65.ts"));
assert.equal(JSON.stringify(unexpected.body).includes("undefined"), false);
assert.equal(toResponse(new NotFoundError("order o9"), () => {}).status, 404); assert.equal(toResponse(new RuleError("an empty order cannot be placed"), () => {}).status, 422);
assert.equal(toResponse("a thrown string", (e) => logs.push(e)).status, 500);
assert.equal(JSON.stringify(new Error("lost")), "{}"); assert.equal(JSON.stringify({ error: new Error("lost") }), '{"error":{}}');
console.log(`errors: wrapped as ${wrapped.name} with cause "${(wrapped.cause as Error).name}" -> ${expected.status}, logged at ${logs[0]?.level} | a TypeError -> ${unexpected.status}, logged at ${logs[1]?.level} with a stack, body ${JSON.stringify(unexpected.body)} | JSON.stringify(new Error("lost")) = ${JSON.stringify(new Error("lost"))}`);

// --- return, and return await, inside try
const a = await withoutAwait().catch((e: Error) => `rejected: ${e.message}`), b = await withAwait();
assert.equal(a, "rejected: the database is down"); assert.equal(b, "fallback");
console.log(`awaiting: "return fragile()" -> ${a} | "return await fragile()" -> ${b}`);

// --- a pure decision is tested with a table, no doubles needed
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
const cases: [string, Shipment, Date, boolean][] = [
  ["placed today", { orderId: "o1", placedAt: day(11), shippedAt: null }, day(11), false],
  ["exactly three days", { orderId: "o1", placedAt: day(8), shippedAt: null }, day(11), false],
  ["three days and a second", { orderId: "o1", placedAt: day(8), shippedAt: null }, new Date(day(11).getTime() + 1000), true],
  ["a week, already shipped", { orderId: "o1", placedAt: day(4), shippedAt: day(6) }, day(11), false],
  ["a week, not shipped", { orderId: "o1", placedAt: day(4), shippedAt: null }, day(11), true],
];
for (const [name, shipment, now, want] of cases) assert.equal(isLate(shipment, now), want, name);
const notified: string[] = [];
const deps = (placed: number) => ({ loadShipment: async (orderId: string) => ({ orderId, placedAt: day(placed), shippedAt: null }), now: () => day(11), notify: async (orderId: string) => { notified.push(orderId); } });
assert.equal(await chaseLateOrder("o1", deps(4)), true); assert.equal(await chaseLateOrder("o2", deps(10)), false);
assert.deepEqual(notified, ["o1"]);
const t0 = performance.now(); for (let i = 0; i < 100_000; i += 1) isLate({ orderId: "o", placedAt: day(4), shippedAt: null }, day(11));
const perCall = (performance.now() - t0) / 100_000;
console.log(`pure: ${cases.length} cases passed; the shell notified ${notified}; one call of isLate takes about ${(perCall * 1e6).toFixed(0)} ns`);

// --- test doubles
const mailer = new SpyMailer();
const paid = await new Checkout(stubGateway({ ok: true, reference: "ref-7" }), mailer, dummyAudit).pay("ana", 550);
assert.equal(paid, "paid"); assert.deepEqual(mailer.sent, [{ to: "ana", subject: "Receipt ref-7" }]);
const quiet = new SpyMailer();
const refused = await new Checkout(stubGateway({ ok: false, reason: "expired" }), quiet, dummyAudit).pay("ana", 550);
assert.equal(refused, "declined"); assert.deepEqual(quiet.sent, []);
const bank = new FakeGateway({ ana: 1000 }); const fakeMail = new SpyMailer(); const checkout = new Checkout(bank, fakeMail, dummyAudit);
const three = [await checkout.pay("ana", 550), await checkout.pay("ana", 300), await checkout.pay("ana", 300)];
assert.deepEqual(three, ["paid", "paid", "declined"]); assert.equal(bank.balanceOf("ana"), 150); assert.equal(fakeMail.sent.length, 2);
console.log(`doubles: stub+spy -> ${paid}, mail ${JSON.stringify(mailer.sent)} | declined -> ${quiet.sent.length} mails | fake bank: ${three.join(", ")}, balance left ${bank.balanceOf("ana")}`);

// --- a property, checked on many random inputs
const good = checkSplit(10_000, 42), naive = checkNaiveSplit(10_000, 42);
assert.deepEqual(good, { runs: 10_000, failure: null }); assert.ok(naive.failure !== null);
assert.deepEqual(checkNaiveSplit(10_000, 42), naive); // the same seed fails in the same place
console.log(`property: Money.split held for ${good.runs} random inputs | rounding each share failed on input ${naive.runs}: ${naive.failure}`);
console.log("all assertions passed");
