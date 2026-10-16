import type { Category, Movie, Screen, SeatId } from "./cinema.ts";

// What one seat is doing at one show. A hold carries the time at which it lapses. A lapsed hold
// is left as it is and read as available: nothing has to run at the moment a hold runs out.
export type SeatState =
  | { readonly kind: "available" }
  | { readonly kind: "held"; readonly holdId: string; readonly until: number }
  | { readonly kind: "booked"; readonly bookingId: string };

export type HoldAnswer = { readonly ok: true } | { readonly ok: false; readonly unavailable: readonly SeatId[] };

const AVAILABLE: SeatState = { kind: "available" };

// A screening of one film on one screen at one time. It owns the state of every seat for that
// screening, so it is the one place that can promise a seat to only one customer.
export class Show {
  readonly id: string;
  readonly movie: Movie;
  readonly screen: Screen;
  readonly startsAt: number;
  readonly prices: Readonly<Record<Category, number>>; // cents
  private readonly seats = new Map<SeatId, SeatState>();

  constructor(id: string, movie: Movie, screen: Screen, startsAt: number, prices: Record<Category, number>) {
    this.id = id;
    this.movie = movie;
    this.screen = screen;
    this.startsAt = startsAt;
    this.prices = { ...prices };
    for (const seat of screen.seats) this.seats.set(seat.id, AVAILABLE);
  }

  // Free means available, or held by a hold that has lapsed.
  isFree(seatId: SeatId, now: number): boolean {
    const s = this.state(seatId);
    return s.kind === "available" || (s.kind === "held" && s.until <= now);
  }

  heldBy(seatId: SeatId, holdId: string, now: number): boolean {
    const s = this.state(seatId);
    return s.kind === "held" && s.holdId === holdId && s.until > now;
  }

  // All or nothing. Every seat is checked before any is changed, and there is no await in between,
  // so no other call can run between the check and the claim.
  hold(holdId: string, seatIds: readonly SeatId[], now: number, until: number): HoldAnswer {
    this.validate(seatIds);
    const unavailable = seatIds.filter((id) => !this.isFree(id, now));
    if (unavailable.length > 0) return { ok: false, unavailable };
    for (const id of seatIds) this.seats.set(id, { kind: "held", holdId, until });
    return { ok: true };
  }

  // Moves a live hold's end later. Refused once the hold has lapsed, even if nobody has taken its seats.
  extend(holdId: string, seatIds: readonly SeatId[], now: number, until: number): boolean {
    if (!seatIds.every((id) => this.heldBy(id, holdId, now))) return false;
    for (const id of seatIds) this.seats.set(id, { kind: "held", holdId, until });
    return true;
  }

  // Gives back whichever of the seats this hold still has. Seats that have passed to someone else are left alone.
  release(holdId: string, seatIds: readonly SeatId[]): void {
    for (const id of seatIds) {
      const s = this.state(id);
      if (s.kind === "held" && s.holdId === holdId) this.seats.set(id, AVAILABLE);
    }
  }

  // Turns a hold into a booking, all seats or none. A lapsed hold can still be booked when
  // lapsedMayBook is set and every one of its seats is free.
  book(holdId: string, seatIds: readonly SeatId[], bookingId: string, now: number, lapsedMayBook: boolean): boolean {
    const ours = (id: SeatId) => this.heldBy(id, holdId, now) || (lapsedMayBook && this.isFree(id, now));
    if (!seatIds.every(ours)) return false;
    for (const id of seatIds) this.seats.set(id, { kind: "booked", bookingId });
    return true;
  }

  priceOf(seatIds: readonly SeatId[]): number {
    return seatIds.reduce((sum, id) => sum + this.prices[this.screen.seat(id).category], 0);
  }

  // Derived, never stored, so the three always add up to the capacity.
  counts(now: number): { available: number; held: number; booked: number } {
    const c = { available: 0, held: 0, booked: 0 };
    for (const [id, s] of this.seats) {
      if (s.kind === "booked") c.booked += 1;
      else if (this.isFree(id, now)) c.available += 1;
      else c.held += 1;
    }
    return c;
  }

  state(seatId: SeatId): SeatState {
    const s = this.seats.get(seatId);
    if (!s) throw new RangeError(`no seat ${seatId} at show ${this.id}`);
    return s;
  }

  freeSeats(now: number): SeatId[] {
    return this.screen.seats.filter((s) => this.isFree(s.id, now)).map((s) => s.id);
  }

  private validate(seatIds: readonly SeatId[]): void {
    if (seatIds.length === 0) throw new RangeError("a hold needs at least one seat");
    if (new Set(seatIds).size !== seatIds.length) throw new RangeError(`the same seat twice in ${seatIds.join(", ")}`);
    for (const id of seatIds) this.state(id);
  }
}
