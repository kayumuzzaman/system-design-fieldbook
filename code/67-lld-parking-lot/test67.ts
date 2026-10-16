import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MinHeap } from "./heap.ts";
import { hourly, standardPricing, withDailyCap, withGrace } from "./pricing.ts";
import { buildSpots, LotError, ParkingLot, Spot, type Vehicle } from "./lot.ts";
import { Gates } from "./gates.ts";
import { claimSpot, createTables, releaseSpot } from "./shared.ts";

// --- the heap returns items in order, whatever order they went in
const heap = new MinHeap<number>((a, b) => a < b);
const shuffled = [5, 3, 9, 1, 7, 2, 8, 6, 4, 0, 5];
for (const n of shuffled) heap.push(n);
const drained: number[] = []; for (let n = heap.pop(); n !== undefined; n = heap.pop()) drained.push(n);
assert.deepEqual(drained, [...shuffled].sort((a, b) => a - b)); assert.equal(heap.size, 0);

// --- pricing
const fee = (minutes: number) => standardPricing("car", minutes);
const table = [[10, 0], [15, 0], [16, 300], [60, 300], [61, 600], [7 * 60 + 59, 2400], [9 * 60, 2400], [24 * 60, 2400], [25 * 60, 2700], [3 * 24 * 60, 7200]] as const;
for (const [minutes, cents] of table) assert.equal(fee(minutes), cents, `${minutes} minutes`);
assert.equal(fee(26 * 60), 3000); assert.equal(fee(1441), 2700); assert.equal(fee(8 * 60), 2400);
assert.equal(standardPricing("motorcycle", 61), 200); assert.equal(standardPricing("van", 600), 4000);
assert.equal(hourly({ motorcycle: 1, car: 300, van: 1 })("car", 9 * 60), 2700);                 // the same nine hours without a cap
assert.equal(withGrace(15, withDailyCap({ motorcycle: 1, car: 2400, van: 1 }, () => 99999))("car", 30), 2400);
console.log("pricing (car): " + table.map(([m, c]) => `${m} min -> ${c}`).join(", "));

// --- the lot: 2 floors, each with 2 small, 3 medium and 1 large spot
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 12, h, m));
const lot = new ParkingLot(buildSpots(2, { small: 2, medium: 3, large: 1 }), standardPricing);
const car = (plate: string): Vehicle => ({ plate, kind: "car" }), bike = (plate: string): Vehicle => ({ plate, kind: "motorcycle" }), van = (plate: string): Vehicle => ({ plate, kind: "van" });
assert.deepEqual(lot.freeCounts, { small: 4, medium: 6, large: 2 });
const t1 = lot.park(car("CAR-1"), at(9));
assert.equal(t1.spot.id, "F1-M3"); assert.equal(t1.id, "T1");                                  // the nearest medium spot
assert.equal(lot.park(bike("BIKE-1"), at(9)).spot.id, "F1-S1");                                 // a motorcycle gets a small one
assert.equal(lot.park(van("VAN-1"), at(9)).spot.id, "F1-L6");
assert.throws(() => lot.park(car("CAR-1"), at(9, 5)), /CAR-1 is already parked here/);
const cars = ["CAR-2", "CAR-3", "CAR-4", "CAR-5", "CAR-6"].map((p) => lot.park(car(p), at(9, 10)).spot.id);
assert.deepEqual(cars, ["F1-M4", "F1-M5", "F2-M3", "F2-M4", "F2-M5"]);                          // floor 1 fills before floor 2
assert.equal(lot.park(car("CAR-7"), at(9, 20)).spot.id, "F2-L6");                               // no medium left: a car may take a large
assert.throws(() => lot.park(car("CAR-8"), at(9, 20)), /no space for a car/);
assert.throws(() => lot.park(van("VAN-2"), at(9, 20)), /no space for a van/);                   // the car took the last large spot
assert.equal(lot.park(bike("BIKE-2"), at(9, 20)).spot.id, "F1-S2");                             // small spots are still free
assert.deepEqual(lot.freeCounts, { small: 2, medium: 0, large: 0 });
const r1 = lot.leave("T1", at(11, 30));
assert.deepEqual(r1, { ticket: "T1", plate: "CAR-1", minutes: 150, feeCents: 900 });
assert.throws(() => lot.leave("T1", at(11, 31)), /no open ticket T1/);                          // a ticket is used once
assert.equal(lot.park(car("CAR-8"), at(11, 35)).spot.id, "F1-M3");                              // the freed spot is the nearest again
assert.throws(() => lot.park(car("CAR-1"), at(12)), /no space for a car/);                      // CAR-1 may return, but the lot is full for cars
assert.throws(() => lot.leave("T99", at(12)), LotError);
assert.throws(() => new Spot(1, 1, "small").vacate("T1" as never), /not held by ticket T1/);
console.log(`lot: first car ${t1.spot.id}; floor 1 fills first ${JSON.stringify(cars)}; a car overflowed into F2-L6; 2 h 30 min cost ${r1.feeCents} cents; freed spot reused`);

// --- invariants under random traffic: no spot holds two vehicles, counts always add up
let seed = 67; const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const spots = buildSpots(3, { small: 4, medium: 10, large: 2 });
const busy = new ParkingLot(spots, standardPricing); const openTickets: string[] = []; let entered = 0, turnedAway = 0, earned = 0, clock = at(6).getTime();
for (let i = 0; i < 20_000; i += 1) {
  clock += Math.floor(random() * 4) * 60_000;
  if (random() < 0.55) {
    const kind = random() < 0.15 ? "motorcycle" : random() < 0.9 ? "car" : "van";
    try { openTickets.push(busy.park({ plate: `P${i}`, kind }, new Date(clock)).id); entered += 1; } catch (error) { assert.ok(error instanceof LotError); turnedAway += 1; }
  } else if (openTickets.length > 0) {
    const [id] = openTickets.splice(Math.floor(random() * openTickets.length), 1);
    earned += busy.leave(id as string, new Date(clock)).feeCents;
  }
  const occupied = spots.filter((s) => !s.free).length, free = busy.freeCounts;
  assert.equal(occupied, openTickets.length);                                                    // one occupied spot for each open ticket
  assert.equal(free.small + free.medium + free.large + occupied, spots.length);
}
console.log(`random traffic: 20000 events, ${entered} vehicles parked, ${turnedAway} turned away, ${(earned / 100).toFixed(2)} taken in fees, invariants held throughout`);

// --- two gates and one spot
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const last = () => [new Spot(1, 7, "medium")];
const racy = new Gates(last(), () => sleep(5));
const racyResult = await Promise.all([racy.enterRacy(), racy.enterRacy()]);
assert.deepEqual(racyResult.map((s) => s?.id), ["F1-M7", "F1-M7"]);                             // both gates issued the same spot
const safe = new Gates(last(), () => sleep(5));
const safeResult = await Promise.all([safe.enterClaimFirst(), safe.enterClaimFirst()]);
assert.deepEqual(safeResult.map((s) => s?.id ?? null), ["F1-M7", null]);
const jammed = new Gates(last(), async () => { throw new Error("printer jammed"); });
await assert.rejects(jammed.enterClaimFirst(), /printer jammed/);
assert.equal((await new Gates(last(), async () => {}).enterClaimFirst())?.id, "F1-M7");
const retry = new Gates(last(), (() => { let n = 0; return async () => { if ((n += 1) === 1) throw new Error("printer jammed"); }; })());
await assert.rejects(retry.enterClaimFirst()); assert.equal((await retry.enterClaimFirst())?.id, "F1-M7"); // the spot was given back
console.log(`gates: racy gave ${racyResult.map((s) => s?.id)} | claim-first gave ${safeResult.map((s) => s?.id ?? "nothing")}`);

// --- the same claim made by a database, for several servers
const db = new DatabaseSync(":memory:"); createTables(db);
const insert = db.prepare("INSERT INTO spots (id, floor, number, size) VALUES (?, ?, ?, ?)");
for (const s of buildSpots(1, { small: 1, medium: 2, large: 1 })) insert.run(s.id, s.floor, s.number, s.size);
const claims = ["CAR-1", "CAR-2", "CAR-3", "CAR-4"].map((plate) => claimSpot(db, plate, ["medium", "large"]));
assert.deepEqual(claims, ["F1-M2", "F1-M3", "F1-L4", null]);
assert.throws(() => claimSpot(db, "CAR-1", ["small"]), /UNIQUE constraint failed/);              // the same vehicle cannot hold two spots
assert.equal(releaseSpot(db, "CAR-2"), true); assert.equal(claimSpot(db, "CAR-4", ["medium", "large"]), "F1-M3");
assert.equal(releaseSpot(db, "NOBODY"), false);
console.log(`database: four cars claimed ${JSON.stringify(claims)}; a second spot for CAR-1 was refused by a unique index; a released spot was claimed again`);
console.log("all assertions passed");
