// The parts of a cinema that do not change from one show to the next: films, screens and their seats.
export type Category = "standard" | "premium";
export type SeatId = string; // row letter and number, such as "C7"

export interface Movie {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
}

export interface Seat {
  readonly id: SeatId;
  readonly row: string;
  readonly number: number;
  readonly category: Category;
}

// A screen is a room with a fixed layout. Its seats exist whatever is showing.
export class Screen {
  readonly id: string;
  readonly seats: readonly Seat[];
  private readonly byId: ReadonlyMap<SeatId, Seat>;

  constructor(id: string, layout: readonly { rows: string; seatsInRow: number; category: Category }[]) {
    this.id = id;
    const seats: Seat[] = [];
    for (const part of layout) {
      for (const row of part.rows) {
        for (let n = 1; n <= part.seatsInRow; n += 1) seats.push({ id: `${row}${n}`, row, number: n, category: part.category });
      }
    }
    this.seats = seats;
    this.byId = new Map(seats.map((s) => [s.id, s]));
  }

  seat(id: SeatId): Seat {
    const seat = this.byId.get(id);
    if (!seat) throw new RangeError(`no seat ${id} in ${this.id}`);
    return seat;
  }

  get capacity(): number {
    return this.seats.length;
  }
}
