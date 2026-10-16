// One set of expectations for every implementation of the OrderRepository port.
import assert from "node:assert/strict";
import { Money } from "./domain/money.ts";
import { Order, type CustomerId, type OrderId, type PhotoId } from "./domain/order.ts";
import { ConflictError, type OrderRepository } from "./application/ports.ts";

const id = (s: string) => s as OrderId, photo = (s: string) => s as PhotoId, ana = "ana" as CustomerId;
const eur = (cents: number) => Money.of(cents, "EUR");

export async function repositoryContract(make: () => OrderRepository): Promise<number> {
  let checks = 0;
  const check = (fn: () => void) => { fn(); checks += 1; };
  const orders = make();

  const missing = await orders.get(id("missing"));
  check(() => assert.equal(missing, null));

  const order = new Order(id("o1"), ana);
  order.addPrints(photo("p1"), "10x15", 3, eur(25)); order.addPrints(photo("p2"), "20x30", 1, eur(450));
  await orders.save(order);
  const loaded = await orders.get(id("o1"));
  check(() => assert.deepEqual(loaded?.toSnapshot(), order.toSnapshot())); // comes back whole and equal
  check(() => assert.notEqual(loaded, order));                              // as a separate object
  check(() => assert.equal(String(loaded?.total), "5.25 EUR"));

  order.place(); await orders.save(order);                                  // the same object can be saved again
  const reloaded = await orders.get(id("o1"));
  check(() => assert.equal(reloaded?.status, "placed"));

  const draft = new Order(id("o2"), ana); await orders.save(draft);
  const first = await orders.get(id("o2")), second = await orders.get(id("o2"));
  assert.ok(first && second);
  first.addPrints(photo("p1"), "13x18", 2, eur(60)); await orders.save(first);
  second.addPrints(photo("p9"), "10x15", 9, eur(25));
  await assert.rejects(orders.save(second), ConflictError); checks += 1;    // a stale copy is refused
  const after = await orders.get(id("o2"));
  check(() => assert.deepEqual(after?.items.map((line) => line.photo), ["p1"])); // and changed nothing

  await assert.rejects(orders.save(new Order(id("o2"), ana)), ConflictError); checks += 1; // an existing id cannot be created again
  return checks;
}
