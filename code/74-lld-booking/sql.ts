import type { DatabaseSync } from "node:sqlite";
import type { SeatId } from "./cinema.ts";

// One row for each seat at each show, and a table of booked seats whose primary key is the rule itself.
export function createTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE show_seats (
      show_id TEXT NOT NULL, seat_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked')),
      hold_id TEXT, held_until INTEGER,
      PRIMARY KEY (show_id, seat_id));
    CREATE TABLE booked_seats (
      show_id TEXT NOT NULL, seat_id TEXT NOT NULL, booking_id TEXT NOT NULL,
      PRIMARY KEY (show_id, seat_id));`);
}

export function addShow(db: DatabaseSync, showId: string, seatIds: readonly SeatId[]): void {
  const insert = db.prepare("INSERT INTO show_seats (show_id, seat_id) VALUES (?, ?)");
  for (const id of seatIds) insert.run(showId, id);
}

const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

// Runs work in a transaction that takes the write lock at once. It is kept only if work returns true.
// A broken uniqueness rule counts as a refusal, not an error.
function inTransaction(db: DatabaseSync, work: () => boolean): boolean {
  db.exec("BEGIN IMMEDIATE");
  try {
    const keep = work();
    db.exec(keep ? "COMMIT" : "ROLLBACK");
    return keep;
  } catch (error) {
    db.exec("ROLLBACK");
    if (String(error).includes("UNIQUE constraint failed")) return false;
    throw error;
  }
}

// All or nothing: a conditional UPDATE changes only seats that are free now. Unless it changed every one, nothing is kept.
export function holdSeats(db: DatabaseSync, showId: string, holdId: string, seatIds: readonly SeatId[], now: number, until: number): boolean {
  return inTransaction(db, () => {
    const { changes } = db.prepare(`
      UPDATE show_seats SET status = 'held', hold_id = ?, held_until = ?
      WHERE show_id = ? AND seat_id IN (${marks(seatIds.length)})
        AND (status = 'available' OR (status = 'held' AND held_until <= ?))`).run(holdId, until, showId, ...seatIds, now);
    return Number(changes) === seatIds.length;
  });
}

// Broken: reads, does some work, then writes with no condition. Each statement is atomic; the pair is not.
export function holdSeatsReadThenWrite(db: DatabaseSync, showId: string, holdId: string, seatIds: readonly SeatId[], now: number, until: number, work: () => void): boolean {
  const row = db.prepare(`
    SELECT count(*) AS free FROM show_seats
    WHERE show_id = ? AND seat_id IN (${marks(seatIds.length)})
      AND (status = 'available' OR (status = 'held' AND held_until <= ?))`).get(showId, ...seatIds, now) as { free: number };
  if (row.free !== seatIds.length) return false;
  work(); // other sessions read the same free seats meanwhile
  db.prepare(`UPDATE show_seats SET status = 'held', hold_id = ?, held_until = ? WHERE show_id = ? AND seat_id IN (${marks(seatIds.length)})`)
    .run(holdId, until, showId, ...seatIds);
  return true;
}

function writeBooking(db: DatabaseSync, showId: string, seatIds: readonly SeatId[], bookingId: string): void {
  const insert = db.prepare("INSERT INTO booked_seats (show_id, seat_id, booking_id) VALUES (?, ?, ?)");
  for (const id of seatIds) insert.run(showId, id, bookingId); // a seat booked before fails here
  db.prepare(`UPDATE show_seats SET status = 'booked' WHERE show_id = ? AND seat_id IN (${marks(seatIds.length)})`).run(showId, ...seatIds);
}

// The normal path: book only if this hold still has every seat and has not lapsed.
export function bookSeats(db: DatabaseSync, showId: string, holdId: string, seatIds: readonly SeatId[], bookingId: string, now: number): boolean {
  return inTransaction(db, () => {
    const live = db.prepare(`
      SELECT count(*) AS n FROM show_seats WHERE show_id = ? AND seat_id IN (${marks(seatIds.length)})
        AND status = 'held' AND hold_id = ? AND held_until > ?`).get(showId, ...seatIds, holdId, now) as { n: number };
    if (live.n !== seatIds.length) return false;
    writeBooking(db, showId, seatIds, bookingId);
    return true;
  });
}

// A path that trusts whatever hold it was given, as a bug or a second sales channel might.
// Only the primary key stands between it and a seat sold twice.
export function bookTrusting(db: DatabaseSync, showId: string, seatIds: readonly SeatId[], bookingId: string): boolean {
  return inTransaction(db, () => {
    writeBooking(db, showId, seatIds, bookingId);
    return true;
  });
}

export function seatCounts(db: DatabaseSync, showId: string, now: number): { available: number; held: number; booked: number } {
  const row = db.prepare(`
    SELECT sum(status = 'booked') AS booked,
           sum(status = 'held' AND held_until > ?) AS held,
           sum(status = 'available' OR (status = 'held' AND held_until <= ?)) AS available
    FROM show_seats WHERE show_id = ?`).get(now, now, showId) as { available: number; held: number; booked: number };
  return { available: row.available, held: row.held, booked: row.booked };
}
