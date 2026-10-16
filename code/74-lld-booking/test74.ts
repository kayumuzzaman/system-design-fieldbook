import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BookingService, GRACE, ManualClock, STRICT, type Outcome, type Policy } from "./booking.ts";
import { FakePayments, type Answer } from "./payments.ts";
import { Show } from "./show.ts";
import { checkoutWithoutKey, holdCheckAndSet, holdReadThenWrite, RemoteSeats } from "./racy.ts";
import { addShow, bookSeats, bookTrusting, createTables, holdSeats, seatCounts } from "./sql.ts";
import { contend } from "./contention.ts";
import { customers, hall, seeded, simulate } from "./simulate.ts";

const MIN = 60_000, SEC = 1_000;
const T0 = Date.UTC(2026, 9, 16, 17, 0); // 17:00, when sales open in these tests
const at = (minutes: number) => T0 + minutes * MIN;
const movie = { id: "M1", title: "The Long Night", minutes: 128 };
const screen = hall(); // ten rows of ten: A to G standard, H to J premium
const newShow = () => new Show("S1", movie, screen, at(180), { standard: 900, premium: 1300 });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// --- the model
{
  const show = newShow();
  assert.equal(screen.capacity, 100);
  assert.equal(screen.seat("H3").category, "premium");
  assert.equal(show.priceOf(["C5", "C6", "H3"]), 900 + 900 + 1300);
  assert.deepEqual(show.counts(T0), { available: 100, held: 0, booked: 0 });
  assert.throws(() => screen.seat("K1"), /no seat K1/);
}

// --- a hold lapses by itself: nothing runs at the moment it ends
{
  const show = newShow();
  assert.deepEqual(show.hold("H1", ["C7"], T0, at(10)), { ok: true });
  assert.equal(show.isFree("C7", at(10) - 1), false);
  assert.equal(show.isFree("C7", at(10)), true);
  assert.deepEqual(show.state("C7"), { kind: "held", holdId: "H1", until: at(10) }); // the stored state never changed
  assert.deepEqual(show.counts(at(10)), { available: 100, held: 0, booked: 0 });
  assert.equal(show.extend("H1", ["C7"], at(10), at(20)), false); // a lapsed hold cannot be revived
  assert.deepEqual(show.hold("H2", ["C7"], at(11), at(21)), { ok: true });
  show.release("H1", ["C7"]); // a late release from the first customer...
  assert.equal(show.heldBy("C7", "H2", at(12)), true); // ...does not take the seat from the second
  assert.throws(() => show.hold("H3", ["C8", "C8"], at(12), at(22)), /same seat twice/);
  assert.throws(() => show.hold("H3", [], at(12), at(22)), /at least one seat/);
  console.log("lapsing: C7 held until 17:10 is free at 17:10 with no write; a second customer took it; the first one's late release left it alone");
}

// --- all or nothing
{
  const show = newShow();
  assert.deepEqual(show.hold("ana", ["C5", "C6", "C7"], T0, at(10)), { ok: true });
  assert.deepEqual(show.hold("ben", ["C7", "C8", "C9"], T0, at(10)), { ok: false, unavailable: ["C7"] });
  assert.ok(show.isFree("C8", T0) && show.isFree("C9", T0)); // ben holds nothing at all
  assert.deepEqual(show.counts(T0), { available: 97, held: 3, booked: 0 });

  // Overlapping requests on one row of ten, one a second, each for 1 to 4 adjacent seats held 5 to 60 seconds.
  // After each: every live hold has all of its seats. Compared with claiming seat by seat and stopping at the first taken one.
  const random = seeded(7);
  const row = newShow(), bySeat = newShow();
  const live: { id: string; seats: string[]; until: number }[] = [];
  let granted = 0, refused = 0, stranded = 0, maxStranded = 0;
  const strandedNow: { seats: string[]; until: number }[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const now = T0 + i * SEC, k = 1 + Math.floor(random() * 4), first = 1 + Math.floor(random() * (11 - k));
    const seats = Array.from({ length: k }, (_, j) => `E${first + j}`), until = now + (5 + Math.floor(random() * 56)) * SEC;
    const answer = row.hold(`h${i}`, seats, now, until);
    if (answer.ok) { granted += 1; live.push({ id: `h${i}`, seats, until }); } else refused += 1;
    for (const h of live) if (h.until > now) assert.ok(h.seats.every((s) => row.heldBy(s, h.id, now)), "a live hold has every one of its seats");
    // seat by seat: take each seat in turn, stop at the first that is taken, and keep what was taken
    const taken: string[] = [];
    for (const s of seats) { if (!bySeat.isFree(s, now)) break; bySeat.hold(`s${i}`, [s], now, until); taken.push(s); }
    if (taken.length < seats.length && taken.length > 0) { stranded += taken.length; strandedNow.push({ seats: taken, until }); }
    maxStranded = Math.max(maxStranded, strandedNow.filter((x) => x.until > now).reduce((n, x) => n + x.seats.length, 0));
  }
  console.log(`all or nothing: 2000 overlapping requests on one row, ${granted} granted whole, ${refused} refused with nothing held; seat by seat would have left ${stranded} seats held for customers told no (up to ${maxStranded} at once)`);
}

// --- the payment in the middle
const setup = (policy: Omit<Policy, "holdMs">, answer: (r: { key: string }) => Answer = () => "approve") => {
  const clock = new ManualClock(T0), payments = new FakePayments(answer), show = newShow();
  const service = new BookingService(payments, clock, { holdMs: 10 * MIN, ...policy });
  service.addShow(show);
  const hold = (who: string, seats: string[]) => {
    const h = service.hold("S1", who, seats);
    assert.ok(h.ok);
    return h.hold;
  };
  return { clock, payments, show, service, hold };
};
{
  // paid in time
  const { payments, show, service, hold } = setup(GRACE);
  const h = hold("ana", ["C5", "C6"]);
  const out = await service.checkout(h.id, "k1");
  assert.equal(out.kind, "booked");
  assert.deepEqual(payments.totals(), { charges: 1, taken: 1800, refunded: 0 });
  assert.deepEqual(show.counts(T0), { available: 98, held: 0, booked: 2 });
}
{
  // declined: the seats are free at once, not ten minutes later
  const { payments, show, service, hold } = setup(GRACE, () => "decline");
  const h = hold("ana", ["C5", "C6"]);
  assert.deepEqual(await service.checkout(h.id, "k1"), { kind: "declined", reason: "card declined" });
  assert.ok(show.isFree("C5", T0));
  assert.equal(service.hold("S1", "ben", ["C5", "C6"]).ok, true);
  assert.deepEqual(payments.totals(), { charges: 0, taken: 0, refunded: 0 });
}
{
  // abandoned: nothing to do, the hold lapses
  const { clock, payments, show, hold } = setup(GRACE);
  hold("ana", ["C5", "C6"]);
  clock.set(at(10));
  assert.deepEqual(show.counts(clock.now()), { available: 100, held: 0, booked: 0 });
  assert.equal(payments.calls, 0);
}
const late: string[] = [];
for (const [name, policy] of [["strict", STRICT], ["grace", GRACE]] as const) {
  // paid after the hold ended, and the seats went to someone else meanwhile
  {
    const { clock, payments, show, service, hold } = setup(policy, () => "wait");
    const h = hold("ana", ["C5", "C6"]);
    clock.set(at(9)); // presses pay at 17:09
    const paying = service.checkout(h.id, "k1");
    clock.set(at(15)); // her hold has ended: at 17:10 strictly, or at 17:14 with the grace
    const ben = hold("ben", ["C5", "C6"]);
    clock.set(at(20));
    payments.settle("k1", true); // her bank answers at 17:20
    const out = await paying;
    assert.equal(out.kind, "refunded");
    assert.ok(show.heldBy("C5", ben.id, clock.now()));
    assert.deepEqual(payments.totals(), { charges: 1, taken: 1800, refunded: 1800 });
  }
  // the answer comes 90 seconds after the original end, and nobody has taken the seats
  {
    const { clock, payments, service, hold } = setup(policy, () => "wait");
    const h = hold("ana", ["C5", "C6"]);
    clock.set(at(9.5)); // presses pay with 30 seconds left
    const paying = service.checkout(h.id, "k1");
    clock.set(at(11.5));
    payments.settle("k1", true);
    const quick = (await paying).kind;
    // the answer comes 30 minutes after the original end, seats still free
    const second = setup(policy, () => "wait");
    const h2 = second.hold("ana", ["C5", "C6"]);
    second.clock.set(at(9.5));
    const slow = second.service.checkout(h2.id, "k1");
    second.clock.set(at(40));
    second.payments.settle("k1", true);
    late.push(`${name}: answer 90 s late -> ${quick}, 30 min late with seats free -> ${(await slow).kind}`);
    assert.deepEqual([quick, (await slow).kind], name === "strict" ? ["refunded", "refunded"] : ["booked", "booked"]);
  }
}
console.log(`paid after the hold ended, seats taken by another customer: refunded under both policies | ${late.join(" | ")}`);
{
  // a retried confirmation: same key, same single attempt
  const { payments, show, service, hold } = setup(GRACE, () => "wait");
  const h = hold("ana", ["C5", "C6"]);
  const tries = [service.checkout(h.id, "k1"), service.checkout(h.id, "k1"), service.checkout(h.id, "k1")];
  assert.ok(tries[0] === tries[1] && tries[1] === tries[2]);
  payments.settle("k1", true);
  const outs = await Promise.all(tries);
  const ids = outs.map((o) => (o.kind === "booked" ? o.booking.id : o.kind));
  assert.equal(new Set(ids).size, 1);
  const again = await service.checkout(h.id, "k1"), otherKey = await service.checkout(h.id, "k2");
  assert.ok(again.kind === "booked" && otherKey.kind === "booked" && again.booking === otherKey.booking);
  assert.deepEqual(payments.totals(), { charges: 1, taken: 1800, refunded: 0 });
  assert.equal(payments.calls, 1);
  const oneKey = payments.totals().charges;
  assert.equal(service.allBookings().length, 1);
  // two different keys while the first payment is still running
  const h2 = hold("ben", ["D5"]);
  const first = service.checkout(h2.id, "kA"), second = await service.checkout(h2.id, "kB");
  assert.deepEqual(second, { kind: "busy" });
  payments.settle("kA", true);
  assert.equal((await first).kind, "booked");
  // without a remembered key or a paying state, three retries charge three times
  const naive = newShow(), approve = new FakePayments();
  naive.hold("H9", ["C5", "C6"], T0, at(10));
  const results = await Promise.all([1, 2, 3].map(() => checkoutWithoutKey(naive, "H9", ["C5", "C6"], approve, () => T0)));
  assert.deepEqual(results, ["booked", "refunded", "refunded"]);
  assert.deepEqual(approve.totals(), { charges: 3, taken: 5400, refunded: 3600 });
  console.log(`retries: 3 calls with one key -> ${oneKey} charge, 1 booking ${ids[0]}; a later call with a new key -> the same booking; a second key while paying -> busy; without keys -> ${results.join(", ")}, 3 charges, 2 refunds`);
}

// --- double booking with concurrent customers
const seatIds = screen.seats.map((s) => s.id);
const pairFor = (random: () => number) => {
  const row = "ABCDEFGHIJ"[Math.floor(random() * 10)], first = 1 + Math.floor(random() * 9);
  return [`${row}${first}`, `${row}${first + 1}`];
};
{
  // In one process: Show.hold has no await between check and claim. 1,000 customers arrive within 2 ms of each other.
  const show = newShow(), random = seeded(11);
  const granted = await Promise.all(Array.from({ length: 1000 }, async (_, i) => {
    const seats = pairFor(random);
    await sleep(Math.floor(random() * 3));
    return show.hold(`c${i}`, seats, T0, at(10)).ok ? seats : null;
  }));
  const claimed = granted.flatMap((s) => s ?? []);
  assert.equal(new Set(claimed).size, claimed.length);
  console.log(`in one process, 1000 customers: ${granted.filter(Boolean).length} holds granted, ${claimed.length} seats, none twice`);
}
const raceRows: string[] = [];
async function race(n: number, spreadMs: number, trials: number, seed: number) {
  let doubled = 0, worst = 0, told = 0, safeDoubled = 0, safeTold = 0;
  for (let t = 0; t < trials; t += 1) {
    for (const safe of [false, true]) {
      const random = seeded(seed + t);
      const store = new RemoteSeats(seatIds, () => 1 + Math.floor(random() * 3)); // 1 to 3 ms for each call
      const answers = await Promise.all(Array.from({ length: n }, (_, i) => {
        const seats = pairFor(random), wait = Math.floor(random() * spreadMs);
        return sleep(wait).then(() => (safe ? holdCheckAndSet : holdReadThenWrite)(store, seats, `c${i}`));
      }));
      const yes = answers.filter(Boolean).length;
      if (safe) { safeDoubled += store.doubleBooked(); safeTold += yes; }
      else { doubled += store.doubleBooked(); worst = Math.max(worst, store.doubleBooked()); told += yes; }
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { n, spreadMs, doubled: r1(doubled / trials), worst, told: r1(told / trials), safeDoubled, safeTold: r1(safeTold / trials) };
}
for (const n of [2, 10, 100, 1000]) {
  const r = await race(n, 0, 20, 100 * n);
  assert.equal(r.safeDoubled, 0);
  raceRows.push(`${n} at once: read-then-write ${r.doubled} seats double booked on average (worst ${r.worst}), ${r.told} customers told yes; check-and-set 0, ${r.safeTold} told yes`);
}
{
  const r = await race(1000, 1000, 3, 9000);
  assert.equal(r.safeDoubled, 0);
  raceRows.push(`1000 over one second: read-then-write ${r.doubled} double booked on average (worst ${r.worst}), ${r.told} told yes; check-and-set 0, ${r.safeTold} told yes`);
}
console.log("race, 100 seats, each customer wants 2 adjacent seats, 20 trials (3 for the last):\n  " + raceRows.join("\n  "));

// --- in SQL
{
  const db = new DatabaseSync(":memory:");
  createTables(db);
  addShow(db, "S1", seatIds);
  assert.equal(holdSeats(db, "S1", "H1", ["C5", "C6", "C7"], T0, at(10)), true);
  assert.equal(holdSeats(db, "S1", "H2", ["C7", "C8", "C9"], T0, at(10)), false);
  assert.deepEqual(seatCounts(db, "S1", T0), { available: 97, held: 3, booked: 0 }); // C8 and C9 were not kept
  assert.equal(holdSeats(db, "S1", "H3", ["C7", "C8", "C9"], at(11), at(21)), true); // C7's hold had lapsed
  assert.equal(bookSeats(db, "S1", "H1", ["C5", "C6", "C7"], "B1", at(12)), false); // H1 has lapsed and lost C7
  assert.equal(bookSeats(db, "S1", "H3", ["C7", "C8", "C9"], "B2", at(12)), true);
  assert.equal(bookTrusting(db, "S1", ["C9"], "B3"), false); // the primary key refuses a second booking of C9
  assert.deepEqual(seatCounts(db, "S1", at(12)), { available: 97, held: 0, booked: 3 });
  console.log("sql: a conditional UPDATE held C5-C7 and refused C7-C9 whole; a lapsed hold could not book; the primary key refused a second booking of C9");
}
{
  const dir = mkdtempSync(join(tmpdir(), "seats-"));
  try {
    const seats = ["C5", "C6", "C7"];
    const racy = await contend(join(dir, "racy.db"), 8, 20, "readThenWrite", seats);
    const safe = await contend(join(dir, "safe.db"), 8, 20, "conditional", seats);
    assert.ok(safe.every((r) => r.held === 1 && r.booked === 1));
    assert.ok(racy.every((r) => r.booked === 1)); // the primary key held the line
    const told = racy.map((r) => r.held);
    console.log(`sql, 8 threads with their own connections, 20 rounds for the same 3 seats: read then write told ${Math.min(...told)} to ${Math.max(...told)} customers yes per round (${told.reduce((a, b) => a + b, 0)} in all), and the primary key accepted one booking each round; conditional UPDATE told exactly 1 yes every round`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- a day of sales, with the invariants checked after every event
{
  const people = customers(1000, 120, 74);
  const lines: string[] = [];
  for (const w of [2, 5, 10, 15, 20]) {
    const r = await simulate({ holdMinutes: w, policy: "grace", customers: people, minutes: 120 });
    assert.ok(r.invariantChecks > 1000);
    lines.push(`${String(w).padStart(2)} min: sold ${r.seatsSold} in ${r.bookings} bookings, last at minute ${r.soldOutMinute?.toFixed(1)}; abandoned holds peak ${r.blockedPeak} seats, ${r.blockedWhileSelling.toFixed(1)} on average while selling; turned away ${r.turnedAway} (${r.turnedAwayByAbandoned} while abandoned holds sat on enough seats); hold lapsed before paying ${r.ranOutOfTime}; declined ${r.declined}; answers after the original end ${r.lateAnswers}, refunded ${r.refunded}; ${r.invariantChecks} checks`);
  }
  console.log("simulation, 1000 customers over 120 minutes for 100 seats, grace policy, seed 74:\n  " + lines.join("\n  "));
  const strict = await simulate({ holdMinutes: 10, policy: "strict", customers: people, minutes: 120 });
  console.log(`  strict at 10 min: refunded ${strict.refunded} of ${strict.lateAnswers} late answers`);

  // Little's law: in a hall too large to fill, seats in abandoned holds = rate of abandoned holds x seats each x hold time
  const big = await simulate({ holdMinutes: 10, policy: "grace", customers: people, minutes: 120, rows: 10, perRow: 200, check: false });
  assert.equal(big.turnedAway, 0);
  const quitters = people.filter((c) => c.abandons), quitSeats = quitters.reduce((n, c) => n + c.seats, 0);
  const predicted = (quitSeats / 120) * 10;
  console.log(`little: ${quitters.length} of 1000 abandoned, ${quitSeats} seats (${(quitSeats / quitters.length).toFixed(2)} each); predicted ${quitSeats}/120 x 10 = ${predicted.toFixed(1)} seats, measured ${big.blockedSteady.toFixed(1)} from minute 10 to 120; with the assumed rates 1000/120 x 0.25 x 2.25 x 10 = ${((1000 / 120) * 0.25 * 2.25 * 10).toFixed(1)}`);
  assert.ok(Math.abs(big.blockedSteady - predicted) / predicted < 0.05);
}
console.log("all assertions passed");
