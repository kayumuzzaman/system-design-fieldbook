import { MinHeap } from "./heap.ts";
import type { Pricing, VehicleKind } from "./pricing.ts";

export type SpotSize = "small" | "medium" | "large";
export type TicketId = string & { readonly __brand: "TicketId" };

// Which sizes each kind of vehicle may use, best choice first.
const acceptable: Record<VehicleKind, readonly SpotSize[]> = {
  motorcycle: ["small", "medium", "large"],
  car: ["medium", "large"],
  van: ["large"],
};

export interface Vehicle {
  readonly plate: string;
  readonly kind: VehicleKind;
}

export class LotError extends Error {}

// Owns the rule "one spot, at most one vehicle".
export class Spot {
  readonly id: string;
  readonly floor: number;
  readonly number: number;
  readonly size: SpotSize;
  private heldBy: TicketId | null = null;

  constructor(floor: number, number: number, size: SpotSize) {
    this.floor = floor;
    this.number = number;
    this.size = size;
    this.id = `F${floor}-${size[0]?.toUpperCase()}${number}`;
  }
  get free(): boolean {
    return this.heldBy === null;
  }
  occupy(ticket: TicketId): void {
    if (this.heldBy) throw new LotError(`spot ${this.id} is taken`);
    this.heldBy = ticket;
  }
  vacate(ticket: TicketId): void {
    if (this.heldBy !== ticket) throw new LotError(`spot ${this.id} is not held by ticket ${ticket}`);
    this.heldBy = null;
  }
}

export interface Ticket {
  readonly id: TicketId;
  readonly vehicle: Vehicle;
  readonly spot: Spot;
  readonly enteredAt: Date;
}
export interface Receipt {
  readonly ticket: TicketId;
  readonly plate: string;
  readonly minutes: number;
  readonly feeCents: number;
}

// Nearest first: lower floors before higher ones, lower numbers before higher ones.
const nearer = (a: Spot, b: Spot): boolean => a.floor < b.floor || (a.floor === b.floor && a.number < b.number);

export class ParkingLot {
  private readonly pricing: Pricing;
  private readonly freeSpots: Record<SpotSize, MinHeap<Spot>> = { small: new MinHeap(nearer), medium: new MinHeap(nearer), large: new MinHeap(nearer) };
  private readonly open = new Map<TicketId, Ticket>();
  private readonly inside = new Set<string>(); // plates of vehicles currently parked
  private issued = 0;

  constructor(spots: Spot[], pricing: Pricing) {
    this.pricing = pricing;
    for (const spot of spots) this.freeSpots[spot.size].push(spot);
  }

  // Entry: claim the nearest spot of the smallest size that fits, and issue a ticket for it.
  park(vehicle: Vehicle, now: Date): Ticket {
    if (this.inside.has(vehicle.plate)) throw new LotError(`${vehicle.plate} is already parked here`);
    const spot = this.claim(vehicle.kind);
    if (!spot) throw new LotError(`no space for a ${vehicle.kind}`);
    const ticket: Ticket = { id: `T${(this.issued += 1)}` as TicketId, vehicle, spot, enteredAt: now };
    spot.occupy(ticket.id);
    this.open.set(ticket.id, ticket);
    this.inside.add(vehicle.plate);
    return ticket;
  }

  // Exit: work out the fee from the ticket's own times, and put the spot back.
  leave(ticketId: string, now: Date): Receipt {
    const ticket = this.open.get(ticketId as TicketId);
    if (!ticket) throw new LotError(`no open ticket ${ticketId}`);
    const minutes = Math.ceil((now.getTime() - ticket.enteredAt.getTime()) / 60_000);
    if (minutes < 0) throw new LotError("a vehicle cannot leave before it arrived");
    const feeCents = this.pricing(ticket.vehicle.kind, minutes);
    ticket.spot.vacate(ticket.id);
    this.freeSpots[ticket.spot.size].push(ticket.spot);
    this.open.delete(ticket.id);
    this.inside.delete(ticket.vehicle.plate);
    return { ticket: ticket.id, plate: ticket.vehicle.plate, minutes, feeCents };
  }

  // What the sign at the entrance shows.
  get freeCounts(): Record<SpotSize, number> {
    return { small: this.freeSpots.small.size, medium: this.freeSpots.medium.size, large: this.freeSpots.large.size };
  }

  private claim(kind: VehicleKind): Spot | undefined {
    for (const size of acceptable[kind]) {
      const spot = this.freeSpots[size].pop();
      if (spot) return spot;
    }
    return undefined;
  }
}

// A garage of identical floors, for tests and examples.
export function buildSpots(floors: number, perFloor: Record<SpotSize, number>): Spot[] {
  const spots: Spot[] = [];
  for (let floor = 1; floor <= floors; floor += 1) {
    let number = 0;
    for (const size of ["small", "medium", "large"] as const) for (let i = 0; i < perFloor[size]; i += 1) spots.push(new Spot(floor, (number += 1), size));
  }
  return spots;
}
