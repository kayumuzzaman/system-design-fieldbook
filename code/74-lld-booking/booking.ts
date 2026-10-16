import type { SeatId } from "./cinema.ts";
import type { PaymentPort } from "./payments.ts";
import type { Show } from "./show.ts";

export interface Clock {
  now(): number; // milliseconds
}

export class ManualClock implements Clock {
  private t: number;
  constructor(start: number) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  set(t: number): void {
    if (t < this.t) throw new RangeError("time does not go backward");
    this.t = t;
  }
  advance(ms: number): void {
    this.set(this.t + ms);
  }
}

export interface Policy {
  readonly holdMs: number; // how long seats are held while the customer decides
  readonly payGraceMs: number; // when payment starts, the hold is extended to at least now + this (0: never)
  readonly lapsedMayBook: boolean; // a payment that succeeds after the hold lapsed books the seats if they are still free
}
export const STRICT: Omit<Policy, "holdMs"> = { payGraceMs: 0, lapsedMayBook: false };
export const GRACE: Omit<Policy, "holdMs"> = { payGraceMs: 5 * 60_000, lapsedMayBook: true };

export type HoldStatus = "held" | "paying" | "booked" | "released" | "refunded";

// A customer's claim on some seats at one show, until a time. The relationship between a customer and
// the seats, promoted to an entity, as the ticket was in the parking lot.
export class Hold {
  readonly id: string;
  readonly show: Show;
  readonly customer: string;
  readonly seats: readonly SeatId[];
  readonly amount: number;
  expiresAt: number;
  status: HoldStatus = "held";
  bookingId: string | null = null;

  constructor(id: string, show: Show, customer: string, seats: readonly SeatId[], expiresAt: number) {
    this.id = id;
    this.show = show;
    this.customer = customer;
    this.seats = [...seats];
    this.amount = show.priceOf(seats);
    this.expiresAt = expiresAt;
  }
}

export interface Booking {
  readonly id: string;
  readonly holdId: string;
  readonly showId: string;
  readonly customer: string;
  readonly seats: readonly SeatId[];
  readonly amount: number;
  readonly chargeId: string;
}

export type HoldOutcome = { readonly ok: true; readonly hold: Hold } | { readonly ok: false; readonly unavailable: readonly SeatId[] };
export type Outcome =
  | { readonly kind: "booked"; readonly booking: Booking }
  | { readonly kind: "expired" } // the hold had lapsed or been released before payment began: nothing was charged
  | { readonly kind: "busy" } // a payment for this hold is already under way under another key
  | { readonly kind: "declined"; readonly reason: string } // the payment failed: the seats are released
  | { readonly kind: "refunded"; readonly chargeId: string }; // paid, but the seats were gone: money returned

export class BookingService {
  private readonly shows = new Map<string, Show>();
  private readonly holds = new Map<string, Hold>();
  private readonly bookings = new Map<string, Booking>();
  private readonly checkouts = new Map<string, Promise<Outcome>>(); // by idempotency key
  private readonly payments: PaymentPort;
  private readonly clock: Clock;
  private readonly policy: Policy;
  private next = 1;

  constructor(payments: PaymentPort, clock: Clock, policy: Policy) {
    this.payments = payments;
    this.clock = clock;
    this.policy = policy;
  }

  addShow(show: Show): void {
    this.shows.set(show.id, show);
  }

  hold(showId: string, customer: string, seats: readonly SeatId[]): HoldOutcome {
    const show = this.showOf(showId);
    const now = this.clock.now();
    const id = `H${this.next++}`;
    const answer = show.hold(id, seats, now, now + this.policy.holdMs);
    if (!answer.ok) return answer;
    const hold = new Hold(id, show, customer, seats, now + this.policy.holdMs);
    this.holds.set(id, hold);
    return { ok: true, hold };
  }

  // The customer gives up. Abandoning without calling this is also fine: the hold lapses on its own.
  release(holdId: string): void {
    const hold = this.holdOf(holdId);
    if (hold.status !== "held") return;
    hold.show.release(hold.id, hold.seats);
    hold.status = "released";
  }

  // Pay for a hold and turn it into a booking. A retry with the same key gets the same answer from the
  // same single attempt, even while that attempt is still waiting for the payment.
  checkout(holdId: string, key: string): Promise<Outcome> {
    const known = this.checkouts.get(key);
    if (known) return known;
    const attempt = this.pay(this.holdOf(holdId), key);
    this.checkouts.set(key, attempt);
    return attempt;
  }

  private async pay(hold: Hold, key: string): Promise<Outcome> {
    if (hold.status === "booked") return { kind: "booked", booking: this.bookings.get(hold.bookingId as string) as Booking };
    if (hold.status === "paying") return { kind: "busy" };
    const start = this.clock.now();
    const until = Math.max(hold.expiresAt, start + this.policy.payGraceMs);
    if (hold.status !== "held" || !hold.show.extend(hold.id, hold.seats, start, until)) return { kind: "expired" };
    hold.expiresAt = until;
    hold.status = "paying";

    const charge = await this.payments.charge({ key, amount: hold.amount, customer: hold.customer });
    // Anything may have happened while we waited, including the hold lapsing and the seats being sold.
    const now = this.clock.now();
    if (!charge.ok) {
      hold.show.release(hold.id, hold.seats);
      hold.status = "released";
      return { kind: "declined", reason: charge.reason };
    }
    const bookingId = `B${this.next++}`;
    if (hold.show.book(hold.id, hold.seats, bookingId, now, this.policy.lapsedMayBook)) {
      const booking: Booking = { id: bookingId, holdId: hold.id, showId: hold.show.id, customer: hold.customer, seats: hold.seats, amount: hold.amount, chargeId: charge.chargeId };
      this.bookings.set(bookingId, booking);
      hold.status = "booked";
      hold.bookingId = bookingId;
      return { kind: "booked", booking };
    }
    hold.status = "refunded";
    await this.payments.refund(charge.chargeId);
    return { kind: "refunded", chargeId: charge.chargeId };
  }

  holdOf(holdId: string): Hold {
    const hold = this.holds.get(holdId);
    if (!hold) throw new RangeError(`no hold ${holdId}`);
    return hold;
  }

  showOf(showId: string): Show {
    const show = this.shows.get(showId);
    if (!show) throw new RangeError(`no show ${showId}`);
    return show;
  }

  allBookings(): Booking[] {
    return [...this.bookings.values()];
  }

  allHolds(): Hold[] {
    return [...this.holds.values()];
  }
}
