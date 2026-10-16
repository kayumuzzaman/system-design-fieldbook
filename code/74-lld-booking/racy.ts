import type { SeatId } from "./cinema.ts";
import type { PaymentPort } from "./payments.ts";
import type { Show } from "./show.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Seat states kept somewhere else, such as another process: every call waits, as a round trip would.
export class RemoteSeats {
  private readonly holders = new Map<SeatId, string[]>(); // everyone ever told they hold the seat
  private readonly latency: () => number;

  constructor(seatIds: readonly SeatId[], latency: () => number) {
    for (const id of seatIds) this.holders.set(id, []);
    this.latency = latency;
  }

  async read(seatIds: readonly SeatId[]): Promise<boolean[]> {
    await sleep(this.latency());
    return seatIds.map((id) => this.current(id) === null);
  }

  async write(seatIds: readonly SeatId[], customer: string): Promise<void> {
    await sleep(this.latency());
    for (const id of seatIds) (this.holders.get(id) as string[]).push(customer);
  }

  // The check and the claim as one operation where the data lives, with nothing in between.
  async claim(seatIds: readonly SeatId[], customer: string): Promise<boolean> {
    await sleep(this.latency());
    if (!seatIds.every((id) => this.current(id) === null)) return false;
    for (const id of seatIds) (this.holders.get(id) as string[]).push(customer);
    return true;
  }

  // Seats that more than one customer was told they hold.
  doubleBooked(): number {
    return [...this.holders.values()].filter((h) => h.length > 1).length;
  }

  private current(id: SeatId): string | null {
    const h = this.holders.get(id) as string[];
    return h.length > 0 ? (h[h.length - 1] as string) : null;
  }
}

// Broken: reads, then writes, with an await in between. Others read the same free seats meanwhile.
export async function holdReadThenWrite(store: RemoteSeats, seatIds: readonly SeatId[], customer: string): Promise<boolean> {
  const free = await store.read(seatIds);
  if (!free.every(Boolean)) return false;
  await store.write(seatIds, customer);
  return true;
}

// Fixed: one call that checks and claims together.
export function holdCheckAndSet(store: RemoteSeats, seatIds: readonly SeatId[], customer: string): Promise<boolean> {
  return store.claim(seatIds, customer);
}

// Checkout without a remembered key or a "paying" state: every retry charges again.
export async function checkoutWithoutKey(show: Show, holdId: string, seats: readonly SeatId[], payments: PaymentPort, now: () => number): Promise<string> {
  const charge = await payments.charge({ key: crypto.randomUUID(), amount: show.priceOf(seats), customer: "retrying" });
  if (!charge.ok) return "declined";
  if (show.book(holdId, seats, `B-${holdId}`, now(), false)) return "booked";
  await payments.refund(charge.chargeId);
  return "refunded";
}
