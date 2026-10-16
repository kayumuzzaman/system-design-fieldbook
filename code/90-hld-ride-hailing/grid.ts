// Where every available driver is now: an in-memory grid of square cells, keyed by cell.
// Positions are meters east and north of a corner of the city, which is accurate enough at city scale.
export type Point = { readonly x: number; readonly y: number };

export class DriverGrid {
  private readonly size: number;
  private readonly cells = new Map<string, Set<string>>();
  private readonly where = new Map<string, { x: number; y: number; cell: string }>();
  constructor(cellMeters: number) {
    this.size = cellMeters;
  }
  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }
  private cellOf(p: Point): string {
    return this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size));
  }

  // A location report. Returns true when the driver moved into another cell, the only case
  // that touches the index; otherwise only the stored position changes.
  report(id: string, p: Point): boolean {
    const cell = this.cellOf(p);
    const old = this.where.get(id);
    this.where.set(id, { x: p.x, y: p.y, cell });
    if (old && old.cell === cell) return false;
    if (old) this.cells.get(old.cell)?.delete(id);
    let set = this.cells.get(cell);
    if (!set) this.cells.set(cell, (set = new Set()));
    set.add(id);
    return true;
  }
  remove(id: string): void {
    const old = this.where.get(id);
    if (!old) return;
    this.cells.get(old.cell)?.delete(id);
    this.where.delete(id);
  }
  get size_(): number {
    return this.where.size;
  }

  // The k nearest drivers in straight-line distance: search rings of cells outward until the
  // nearest k found are closer than any cell not yet searched could be.
  nearest(p: Point, k: number, maxMeters = 10_000): { ids: string[]; examined: number; cells: number } {
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size);
    const found: Array<{ id: string; d: number }> = [];
    let examined = 0, cells = 0;
    for (let ring = 0; ring * this.size <= maxMeters + this.size; ring += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // only the ring's edge
          cells += 1;
          for (const id of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) {
            const w = this.where.get(id) as { x: number; y: number };
            examined += 1;
            found.push({ id, d: Math.hypot(w.x - p.x, w.y - p.y) });
          }
        }
      }
      found.sort((a, b) => a.d - b.d);
      // Anything in a ring not yet searched is at least `ring * size` away from p.
      if (found.length >= k && (found[k - 1] as { d: number }).d <= ring * this.size) break;
    }
    return { ids: found.slice(0, k).filter((f) => f.d <= maxMeters).map((f) => f.id), examined, cells };
  }
  position(id: string): Point | undefined {
    return this.where.get(id);
  }
  all(): Array<{ id: string; x: number; y: number }> {
    return [...this.where].map(([id, w]) => ({ id, x: w.x, y: w.y }));
  }
}
