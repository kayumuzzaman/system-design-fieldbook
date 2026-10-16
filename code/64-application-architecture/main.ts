// The composition root: the one file that knows every concrete class. Run with: node main.ts
import { DatabaseSync } from "node:sqlite";
import { Money } from "./domain/money.ts";
import { createOrderApp, type OrderApp } from "./application/orders.ts";
import type { Ports } from "./application/ports.ts";
import { createHttpServer } from "./adapters/http.ts";
import { FixedClock, FixedPrices, InMemoryOrders, RecordingPublisher } from "./adapters/memory.ts";
import { SqliteOrders } from "./adapters/sqlite.ts";

const prices = new FixedPrices({ "10x15": Money.of(25, "EUR"), "13x18": Money.of(60, "EUR"), "20x30": Money.of(450, "EUR") });

// Production wiring: a real database file, the real clock, events written to the log.
export function production(databasePath: string): OrderApp {
  return createOrderApp({
    orders: new SqliteOrders(new DatabaseSync(databasePath)),
    publisher: { publish: async (event) => console.log("event", JSON.stringify(event)) },
    clock: { now: () => new Date() },
    prices,
  });
}

// Test wiring: everything in memory, and handles on the fakes so a test can look inside.
export function forTests(overrides: Partial<Ports> = {}) {
  const publisher = new RecordingPublisher();
  const ports: Ports = { orders: new InMemoryOrders(), publisher, clock: new FixedClock("2026-10-11T09:00:00Z"), prices, ...overrides };
  return { app: createOrderApp(ports), publisher, ports };
}

if (import.meta.main) {
  createHttpServer(production("orders.db")).listen(8080, () => console.log("listening on http://localhost:8080"));
}
