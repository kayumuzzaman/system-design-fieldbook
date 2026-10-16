import type { Car, Direction } from "./car.ts";
import { ElevatorSystem, type Dispatch } from "./system.ts";

export interface Passenger {
  readonly id: number;
  readonly appears: number; // the tick at which they press the hall button
  readonly from: number;
  readonly to: number;
}
export interface Outcome {
  delivered: number;
  averageWait: number;
  longestWait: number;
  averageJourney: number;
  ticks: number;
  wrongWay: number; // times a passenger was let into a car heading the other way: must be zero
}

// Runs the system against a list of passengers until everyone has arrived. A model for comparing strategies:
// cars have unlimited capacity, and one tick is the time to travel one floor.
export function simulate(carCount: number, topFloor: number, dispatch: Dispatch, passengers: readonly Passenger[], limit = 100_000): Outcome {
  const waiting = new Map<number, Passenger[]>();           // by floor
  const riding = new Map<string, Passenger[]>();            // by car
  const waits: number[] = [], journeys: number[] = [];
  let now = 0, wrongWay = 0;
  const wants = (p: Passenger): Direction => (p.to > p.from ? "up" : "down");

  const system: ElevatorSystem = new ElevatorSystem(carCount, topFloor, dispatch, (car: Car) => {
    const aboard = riding.get(car.id) ?? [];
    for (const p of aboard.filter((p) => p.to === car.floor)) journeys.push(now - p.appears);
    const staying = aboard.filter((p) => p.to !== car.floor);
    const here = waiting.get(car.floor) ?? [];
    const boarding = here.filter((p) => car.direction === null || wants(p) === car.direction);
    for (const p of boarding) {
      if (car.direction !== null && wants(p) !== car.direction) wrongWay += 1;
      waits.push(now - p.appears);
      car.pressFloor(p.to);
    }
    waiting.set(car.floor, here.filter((p) => !boarding.includes(p)));
    riding.set(car.id, [...staying, ...boarding]);
  });

  const queue = [...passengers].sort((a, b) => a.appears - b.appears);
  while (journeys.length < passengers.length && now < limit) {
    while (queue.length > 0 && (queue[0] as Passenger).appears <= now) {
      const p = queue.shift() as Passenger;
      waiting.set(p.from, [...(waiting.get(p.from) ?? []), p]);
      system.callFrom(p.from, wants(p));
    }
    // anyone still on a landing makes sure their button is lit
    for (const floor of [...waiting.keys()]) {
      for (const direction of ["up", "down"] as const) {
        if ((waiting.get(floor) ?? []).some((p) => wants(p) === direction)) system.callFrom(floor, direction);
      }
    }
    system.tick();
    now += 1;
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return { delivered: journeys.length, averageWait: mean(waits), longestWait: Math.max(0, ...waits), averageJourney: mean(journeys), ticks: now, wrongWay };
}

// A repeatable crowd: the same seed always gives the same passengers.
export function crowd(count: number, topFloor: number, overTicks: number, seed: number, lobbyShare = 0): Passenger[] {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Array.from({ length: count }, (_, id) => {
    const from = random() < lobbyShare ? 0 : Math.floor(random() * (topFloor + 1));
    let to = Math.floor(random() * topFloor);
    if (to >= from) to += 1;
    return { id, appears: Math.floor(random() * overTicks), from, to };
  });
}
