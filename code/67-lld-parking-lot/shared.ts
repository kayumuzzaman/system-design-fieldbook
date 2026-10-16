import type { DatabaseSync } from "node:sqlite";

// With several servers, or several gate controllers, the claim has to be made by the database.
export function createTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE spots (id TEXT PRIMARY KEY, floor INTEGER NOT NULL, number INTEGER NOT NULL, size TEXT NOT NULL, plate TEXT);
    CREATE UNIQUE INDEX one_spot_for_each_vehicle ON spots (plate) WHERE plate IS NOT NULL;`);
}

// One statement finds the nearest free spot of an acceptable size and takes it. No other session can get in between.
export function claimSpot(db: DatabaseSync, plate: string, sizes: string[]): string | null {
  const marks = sizes.map(() => "?").join(", ");
  const row = db.prepare(`
    UPDATE spots SET plate = ?
    WHERE id = (SELECT id FROM spots WHERE plate IS NULL AND size IN (${marks}) ORDER BY floor, number LIMIT 1)
      AND plate IS NULL
    RETURNING id`).get(plate, ...sizes);
  return row ? String(row["id"]) : null;
}

export function releaseSpot(db: DatabaseSync, plate: string): boolean {
  return db.prepare("UPDATE spots SET plate = NULL WHERE plate = ?").run(plate).changes === 1;
}
