import type { Sim } from "./sim.ts";

// Hotel inventory: for each room type and night, how many rooms exist and how many are reserved.
// A stay of several nights needs a room on every one of them. Each call to the store is a round
// trip of 1 to 3 ms; what matters is what can happen between two round trips.
export interface Row { total: number; reserved: number }
export const key = (roomType: string, night: number) => `${roomType}|${night}`;

export class InventoryStore {
  readonly rows = new Map<string, Row>();
  private readonly sim: Sim;
  private readonly random: () => number;
  readonly overbook: number;   // 0.05 allows reservations up to 105% of the rooms
  constructor(sim: Sim, random: () => number, overbook: number) {
    this.sim = sim; this.random = random; this.overbook = overbook;
  }
  limit(row: Row): number {
    return Math.floor(row.total * (1 + this.overbook));
  }
  private trip(): Promise<void> {
    return this.sim.sleep(1 + 2 * this.random());
  }
  async read(k: string): Promise<Row> {
    await this.trip();
    return { ...(this.rows.get(k) as Row) };
  }
  async write(k: string, reserved: number): Promise<void> {
    await this.trip();
    (this.rows.get(k) as Row).reserved = reserved;
  }
  // UPDATE inventory SET reserved = reserved + 1 WHERE key = $1 AND reserved + 1 <= limit
  async reserveOne(k: string): Promise<boolean> {
    await this.trip();
    const row = this.rows.get(k) as Row;
    if (row.reserved + 1 > this.limit(row)) return false;
    row.reserved += 1;
    return true;
  }
  async releaseOne(k: string): Promise<void> {
    await this.trip();
    (this.rows.get(k) as Row).reserved -= 1;
  }
  // One transaction over every night of the stay: all of them, or none.
  async reserveAll(keys: string[]): Promise<boolean> {
    await this.trip();
    const rows = keys.map((k) => this.rows.get(k) as Row);
    if (rows.some((row) => row.reserved + 1 > this.limit(row))) return false;
    for (const row of rows) row.reserved += 1;
    return true;
  }
}

export type Strategy = "read, then write" | "night by night" | "night by night, undo on failure" | "all nights at once";
export const STRATEGIES: Strategy[] = ["read, then write", "night by night", "night by night, undo on failure", "all nights at once"];

export async function reserve(store: InventoryStore, keys: string[], how: Strategy): Promise<boolean> {
  switch (how) {
    case "read, then write":
      for (const k of keys) {
        const row = await store.read(k);
        if (row.reserved + 1 > store.limit(row)) return false;   // earlier nights stay written
        await store.write(k, row.reserved + 1);                  // someone may have written in between
      }
      return true;
    case "night by night":
      for (const k of keys) if (!(await store.reserveOne(k))) return false;
      return true;
    case "night by night, undo on failure": {
      const done: string[] = [];
      for (const k of keys) {
        if (!(await store.reserveOne(k))) { for (const d of done) await store.releaseOne(d); return false; }
        done.push(k);
      }
      return true;
    }
    case "all nights at once":
      return store.reserveAll(keys);
  }
}
