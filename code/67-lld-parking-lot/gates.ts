import type { Spot } from "./lot.ts";

// Two ways to write an entry gate when issuing the ticket involves waiting, for a printer or a database.
export class Gates {
  private readonly free: Spot[]; // nearest first
  private readonly printTicket: () => Promise<void>;

  constructor(free: Spot[], printTicket: () => Promise<void>) {
    this.free = [...free];
    this.printTicket = printTicket;
  }

  // Broken: looks at the nearest free spot, waits, and only then takes it.
  async enterRacy(): Promise<Spot | null> {
    const spot = this.free[0];
    if (!spot) return null;
    await this.printTicket(); // the other gate runs here and sees the same spot
    this.free.shift();
    return spot;
  }

  // Fixed: takes the spot out of the free list first, and gives it back if printing fails.
  async enterClaimFirst(): Promise<Spot | null> {
    const spot = this.free.shift();
    if (!spot) return null;
    try {
      await this.printTicket();
      return spot;
    } catch (error) {
      this.free.unshift(spot);
      throw error;
    }
  }
}
