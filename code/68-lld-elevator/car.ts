export type Direction = "up" | "down";
export type CarState = "idle" | "moving" | "doorsOpen";

const delta = { up: 1, down: -1 } as const;
const reverse = { up: "down", down: "up" } as const;

export class ElevatorError extends Error {}

// One elevator car. It is a state machine advanced by tick(): one tick moves a moving car by one floor.
export class Car {
  static readonly dwell = 2; // ticks the doors stay open at a stop

  readonly id: string;
  readonly topFloor: number;
  private at: number;
  private heading: Direction | null = null;
  private mode: CarState = "idle";
  private dwellLeft = 0;
  private readonly inside = new Set<number>(); // floors chosen on the panel in the car
  private readonly hall: Record<Direction, Set<number>> = { up: new Set(), down: new Set() }; // hall calls given to this car
  private readonly onStop: (car: Car) => void;

  constructor(id: string, topFloor: number, startFloor = 0, onStop: (car: Car) => void = () => {}) {
    this.id = id;
    this.topFloor = topFloor;
    this.at = startFloor;
    this.onStop = onStop;
  }

  get floor(): number { return this.at; }
  get direction(): Direction | null { return this.heading; }
  get state(): CarState { return this.mode; }
  get pending(): number { return this.inside.size + this.hall.up.size + this.hall.down.size; }

  // A passenger in the car presses a floor button.
  pressFloor(floor: number): void {
    this.mustExist(floor);
    if (floor === this.at && this.mode === "doorsOpen") return; // already here, doors open
    this.inside.add(floor);
  }

  // The dispatcher gives this car a call made from a landing.
  assignHallCall(floor: number, direction: Direction): void {
    this.mustExist(floor);
    if (this.mode === "doorsOpen" && floor === this.at && (this.heading === direction || this.heading === null)) {
      this.heading = direction; // the car is standing here with its doors open: hold them
      this.dwellLeft = Car.dwell;
      this.onStop(this);
      return;
    }
    this.hall[direction].add(floor);
  }

  tick(): void {
    if (this.mode === "doorsOpen") {
      this.dwellLeft -= 1;
      if (this.dwellLeft === 0) this.closeDoors();
    } else if (this.mode === "idle") {
      if (this.pending > 0) this.depart();
    } else {
      this.at += delta[this.heading as Direction]; // only a car in the moving state changes floor
      if (this.shouldStop()) this.openDoors();
    }
  }

  // The rule of collective control: stop for anyone inside, for a hall call in the direction of travel,
  // and for a hall call the other way only when there is nothing further to go to.
  private shouldStop(): boolean {
    const heading = this.heading as Direction;
    return this.inside.has(this.at) || this.hall[heading].has(this.at) || (!this.anyBeyond(heading) && this.hall[reverse[heading]].has(this.at));
  }

  private openDoors(): void {
    this.mode = "doorsOpen";
    this.dwellLeft = Car.dwell;
    this.inside.delete(this.at);
    this.heading = this.directionFromHere();
    if (this.heading) this.hall[this.heading].delete(this.at);
    this.onStop(this); // passengers get out, and those going this car's way get in and press buttons
  }

  private closeDoors(): void {
    const next = this.directionFromHere();
    if (next !== null && next !== this.heading && this.hall[next].has(this.at)) {
      this.heading = next; // someone here is waiting to go the other way: serve them before leaving
      this.openDoors();
      return;
    }
    this.heading = next;
    this.mode = next === null ? "idle" : "moving";
  }

  private depart(): void {
    if (this.inside.has(this.at) || this.hall.up.has(this.at) || this.hall.down.has(this.at)) {
      this.openDoors();
      return;
    }
    const stops = [...this.inside, ...this.hall.up, ...this.hall.down];
    const nearest = stops.reduce((best, floor) => (Math.abs(floor - this.at) < Math.abs(best - this.at) ? floor : best));
    this.heading = nearest > this.at ? "up" : "down";
    this.mode = "moving";
  }

  // Keep going while there is a reason to. Turn around only when there is nothing ahead. Otherwise rest.
  private directionFromHere(): Direction | null {
    const current = this.heading;
    if (current && (this.anyBeyond(current) || this.hall[current].has(this.at))) return current;
    const other: Direction = current ? reverse[current] : "up";
    if (this.anyBeyond(other) || this.hall[other].has(this.at)) return other;
    if (!current && (this.anyBeyond("down") || this.hall.down.has(this.at))) return "down";
    return null;
  }

  private anyBeyond(direction: Direction): boolean {
    const ahead = (floor: number) => (floor - this.at) * delta[direction] > 0;
    return [...this.inside, ...this.hall.up, ...this.hall.down].some(ahead);
  }

  private mustExist(floor: number): void {
    if (!Number.isInteger(floor) || floor < 0 || floor > this.topFloor) throw new ElevatorError(`there is no floor ${floor}`);
  }

  // How many ticks until this car would open its doors for a call from this floor, given all it has to do first.
  // Found by running a copy of the car forward.
  ticksToServe(floor: number, direction: Direction): number {
    let served = false;
    const copy = new Car(this.id, this.topFloor, this.at, (c) => { if (c.floor === floor && (c.direction === direction || c.direction === null)) served = true; });
    copy.heading = this.heading; copy.mode = this.mode; copy.dwellLeft = this.dwellLeft;
    for (const f of this.inside) copy.inside.add(f);
    for (const d of ["up", "down"] as const) for (const f of this.hall[d]) copy.hall[d].add(f);
    copy.assignHallCall(floor, direction);
    let ticks = 0;
    while (!served && ticks < 20 * (this.topFloor + 2) * (Car.dwell + 1)) { copy.tick(); ticks += 1; }
    return ticks;
  }
}
