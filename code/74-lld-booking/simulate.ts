// A day of sales for one show, driven through BookingService with a manual clock and a fake payment provider.
// Every customer and every delay is drawn in advance from a seeded generator, so each policy sees the same people.
import assert from "node:assert/strict";
import { BookingService, GRACE, ManualClock, STRICT, type Outcome } from "./booking.ts";
import { Screen, type SeatId } from "./cinema.ts";
import { MinHeap } from "./heap.ts";
import { FakePayments } from "./payments.ts";
import { Show } from "./show.ts";

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000, SEC = 1_000;

export interface Customer {
  readonly id: string;
  readonly arrives: number; // ms from the start of sales
  readonly seats: number; // how many adjacent seats they want
  readonly abandons: boolean; // holds seats and never comes back
  readonly thinks: number; // ms from holding to pressing pay
  readonly payTakes: number; // ms from pressing pay to the provider's answer
  readonly approved: boolean;
}

// The assumed customers: 1 to 4 seats; a quarter abandon; the rest press pay after 30 s plus an exponential
// wait averaging 2.5 min; payments take seconds, a minute or two for some, and half an hour for a few.
export function customers(n: number, minutes: number, seed: number): Customer[] {
  const random = seeded(seed);
  const list: Customer[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = random();
    const seats = r < 0.2 ? 1 : r < 0.7 ? 2 : r < 0.85 ? 3 : 4;
    const abandons = random() < 0.25;
    const thinks = 30 * SEC - Math.log(1 - random()) * 150 * SEC;
    const p = random();
    const payTakes = p < 0.85 ? 2 * SEC + random() * 18 * SEC : p < 0.97 ? 30 * SEC + random() * 210 * SEC : 10 * MIN + random() * 30 * MIN;
    const approved = random() < 0.9;
    list.push({ id: `c${i + 1}`, arrives: Math.floor(random() * minutes * MIN), seats, abandons, thinks: Math.round(thinks), payTakes: Math.round(payTakes), approved });
  }
  return list.sort((a, b) => a.arrives - b.arrives);
}

const ROWS_BY_PREFERENCE = "FEGDHCIBJA";
export function hall(rows = 10, perRow = 10): Screen {
  const letters = "ABCDEFGHIJ".slice(0, rows);
  return new Screen("Screen 1", [
    { rows: letters.slice(0, Math.max(0, rows - 3)), seatsInRow: perRow, category: "standard" },
    { rows: letters.slice(Math.max(0, rows - 3)), seatsInRow: perRow, category: "premium" },
  ]);
}

// The best block of k adjacent seats for which free(seat) is true: preferred rows first, nearest the middle.
export function bestBlock(screen: Screen, k: number, free: (id: SeatId) => boolean): SeatId[] | null {
  const perRow = Math.max(...screen.seats.map((s) => s.number));
  const rows = [...ROWS_BY_PREFERENCE].filter((r) => screen.seats.some((s) => s.row === r));
  for (const row of rows) {
    let best: SeatId[] | null = null, bestDistance = Infinity;
    for (let first = 1; first + k - 1 <= perRow; first += 1) {
      const ids = Array.from({ length: k }, (_, j) => `${row}${first + j}`);
      const distance = Math.abs(first + (k - 1) / 2 - (perRow + 1) / 2);
      if (distance < bestDistance && ids.every(free)) { best = ids; bestDistance = distance; }
    }
    if (best) return best;
  }
  return null;
}

export interface SimResult {
  holdMinutes: number;
  policy: "strict" | "grace";
  seatsSold: number;
  bookings: number;
  holds: number;
  turnedAway: number; // no block of seats free when they arrived
  turnedAwayByAbandoned: number; // ...although seats in holds that would never be paid for would have been enough
  ranOutOfTime: number; // their hold lapsed before they pressed pay
  declined: number;
  lateAnswers: number; // payment answered after the hold's original end
  refunded: number; // charged, but the seats were gone
  blockedWhileSelling: number; // seats in abandoned holds, averaged from the start of sales until the last seat was sold
  blockedSteady: number; // the same, averaged from minute holdMinutes to the end, for comparison with Little's law
  blockedPeak: number; // the most at any one moment
  soldOutMinute: number | null; // when the last seat was booked
  invariantChecks: number;
  timeline: { minute: number; booked: number; held: number; available: number; blocked: number }[];
}

export async function simulate(o: { holdMinutes: number; policy: "strict" | "grace"; customers: Customer[]; minutes: number; rows?: number; perRow?: number; check?: boolean }): Promise<SimResult> {
  const clock = new ManualClock(0);
  const payments = new FakePayments(() => "wait");
  const service = new BookingService(payments, clock, { holdMs: o.holdMinutes * MIN, ...(o.policy === "strict" ? STRICT : GRACE) });
  const screen = hall(o.rows, o.perRow);
  const show = new Show("S1", { id: "M1", title: "The Long Night", minutes: 128 }, screen, o.minutes * MIN, { standard: 900, premium: 1300 });
  service.addShow(show);

  type Event = { at: number; seq: number; run: () => Promise<void> | void };
  const queue = new MinHeap<Event>((a, b) => a.at < b.at || (a.at === b.at && a.seq < b.seq));
  let seq = 0;
  const later = (at: number, run: Event["run"]) => queue.push({ at, seq: seq++, run });

  const r: SimResult = { holdMinutes: o.holdMinutes, policy: o.policy, seatsSold: 0, bookings: 0, holds: 0, turnedAway: 0, turnedAwayByAbandoned: 0, ranOutOfTime: 0, declined: 0, lateAnswers: 0, refunded: 0, blockedWhileSelling: 0, blockedSteady: 0, blockedPeak: 0, soldOutMinute: null, invariantChecks: 0, timeline: [] };
  const abandoned: { seats: readonly SeatId[]; from: number; to: number; holdId: string }[] = [];
  const blockedAt = (t: number) => abandoned.filter((a) => a.from <= t && t < a.to).reduce((n, a) => n + a.seats.length, 0);
  const pending = new Map<string, Promise<Outcome>>();

  for (const c of o.customers) {
    later(c.arrives, () => {
      const now = clock.now();
      const block = bestBlock(screen, c.seats, (id) => show.isFree(id, now));
      if (!block) {
        r.turnedAway += 1;
        const inAbandoned = new Set(abandoned.filter((a) => a.from <= now && now < a.to).flatMap((a) => a.seats));
        if (bestBlock(screen, c.seats, (id) => show.isFree(id, now) || inAbandoned.has(id))) r.turnedAwayByAbandoned += 1;
        return;
      }
      const held = service.hold("S1", c.id, block);
      assert.ok(held.ok, "a block chosen from free seats can be held");
      r.holds += 1;
      const hold = held.hold;
      if (c.abandons) { abandoned.push({ seats: hold.seats, from: now, to: hold.expiresAt, holdId: hold.id }); return; }
      const originalEnd = hold.expiresAt;
      later(now + c.thinks, () => {
        const key = `pay-${c.id}`;
        const outcome = service.checkout(hold.id, key);
        if (!payments.isPending(key)) { pending.set(key, outcome); return; } // lapsed before paying: answered at once
        pending.set(key, outcome);
        later(clock.now() + c.payTakes, async () => {
          if (clock.now() >= originalEnd) r.lateAnswers += 1;
          payments.settle(key, c.approved);
          await outcome;
        });
      });
    });
  }

  const sample = (minute: number) => {
    const t = minute * MIN, c = show.counts(t);
    r.timeline.push({ minute, booked: c.booked, held: c.held, available: c.available, blocked: blockedAt(t) });
  };
  let nextSample = 0;
  for (let e = queue.pop(); e; e = queue.pop()) {
    while (nextSample * MIN <= e.at && nextSample <= o.minutes) sample(nextSample++);
    clock.set(Math.max(clock.now(), e.at));
    await e.run();
    if (o.check !== false) checkInvariants(service, show, payments, clock.now()), (r.invariantChecks += 1);
    if (r.soldOutMinute === null && show.counts(clock.now()).booked === screen.capacity) r.soldOutMinute = clock.now() / MIN;
  }
  while (nextSample <= o.minutes) sample(nextSample++);

  for (const outcome of pending.values()) {
    const x = await outcome;
    if (x.kind === "expired") r.ranOutOfTime += 1;
    if (x.kind === "declined") r.declined += 1;
    if (x.kind === "refunded") r.refunded += 1;
  }
  const bookings = service.allBookings();
  r.bookings = bookings.length;
  r.seatsSold = bookings.reduce((n, b) => n + b.seats.length, 0);
  // Seats in abandoned holds as exact time averages over a span, and the most at any one moment.
  const average = (from: number, to: number) => abandoned.reduce((sum, a) => sum + a.seats.length * Math.max(0, Math.min(a.to, to) - Math.max(a.from, from)), 0) / (to - from);
  r.blockedWhileSelling = average(0, (r.soldOutMinute ?? o.minutes) * MIN);
  r.blockedSteady = average(o.holdMinutes * MIN, o.minutes * MIN);
  r.blockedPeak = Math.max(0, ...abandoned.map((a) => blockedAt(a.from)));
  return r;
}

// The rules that must hold after every event, whatever happened.
export function checkInvariants(service: BookingService, show: Show, payments: FakePayments, now: number): void {
  const c = show.counts(now);
  assert.equal(c.available + c.held + c.booked, show.screen.capacity, "every seat is available, held or booked");
  const booked = service.allBookings().flatMap((b) => b.seats);
  assert.equal(new Set(booked).size, booked.length, "no seat is in two bookings");
  assert.equal(booked.length, c.booked, "every booked seat belongs to exactly one booking");
  for (const b of service.allBookings()) for (const id of b.seats) assert.deepEqual(show.state(id), { kind: "booked", bookingId: b.id });
  for (const h of service.allHolds()) {
    if ((h.status === "held" || h.status === "paying") && h.expiresAt > now) assert.ok(h.seats.every((id) => show.heldBy(id, h.id, now)), `live hold ${h.id} has all of its seats`);
  }
  const money = payments.totals();
  const forSeats = service.allBookings().reduce((n, b) => n + b.amount, 0);
  assert.equal(money.taken, forSeats + money.refunded, "money taken = money for booked seats + money refunded");
}
