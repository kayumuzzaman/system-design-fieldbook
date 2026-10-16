// Prints, as JSON, what one car does tick by tick for the scenario drawn in the chapter. The figure is built from this.
import { Car } from "./car.ts";

const events: { tick: number; floor: number; state: string; direction: string | null; note: string }[] = [];
let tick = 0;
const car = new Car("car 1", 9, 2, (c) => events.push({ tick, floor: c.floor, state: "stop", direction: c.direction, note: "" }));
// Already in the car: someone going to 7. Waiting on landings: up from 4, down from 5, down from 8.
car.pressFloor(7);
car.assignHallCall(4, "up");
car.assignHallCall(5, "down");
car.assignHallCall(8, "down");
const boards: Record<string, number> = { "4:up": 9, "8:down": 1, "5:down": 0 }; // where each caller is going
const path: { tick: number; floor: number; state: string; direction: string | null }[] = [{ tick: 0, floor: car.floor, state: car.state, direction: car.direction }];
let handled = 0;
while ((car.pending > 0 || car.state !== "idle") && tick < 200) {
  tick += 1;
  car.tick();
  while (handled < events.length) {
    const e = events[handled] as (typeof events)[number];
    const to = boards[`${e.floor}:${e.direction}`];
    if (to !== undefined) { car.pressFloor(to); e.note = `boards for ${to}`; delete boards[`${e.floor}:${e.direction}`]; }
    handled += 1;
  }
  path.push({ tick, floor: car.floor, state: car.state, direction: car.direction });
}
console.log(JSON.stringify({ stops: events, path }));
