import { Car, type Direction } from "./car.ts";

export interface HallCall {
  readonly floor: number;
  readonly direction: Direction;
}

// The dispatching strategy: which car should answer this call?
export type Dispatch = (call: HallCall, cars: readonly Car[]) => Car;

const least = (cars: readonly Car[], cost: (car: Car) => number): Car =>
  cars.reduce((best, car) => (cost(car) < cost(best) ? car : best));

// Takes turns, whatever the cars are doing.
export const roundRobin = (): Dispatch => {
  let turn = 0;
  return (_, cars) => cars[(turn++) % cars.length] as Car;
};
// The car whose position is closest right now, even if it is moving away.
export const nearestCar: Dispatch = (call, cars) => least(cars, (car) => Math.abs(car.floor - call.floor));
// The car that would reach the caller soonest, counting everything it has already promised to do.
export const soonestArrival: Dispatch = (call, cars) => least(cars, (car) => car.ticksToServe(call.floor, call.direction));

export class ElevatorSystem {
  readonly cars: readonly Car[];
  private readonly dispatch: Dispatch;
  private readonly waiting = new Map<string, Car>(); // hall calls not yet answered, and the car each was given to

  constructor(carCount: number, topFloor: number, dispatch: Dispatch, onStop: (car: Car) => void = () => {}) {
    this.dispatch = dispatch;
    this.cars = Array.from({ length: carCount }, (_, i) => new Car(`car ${i + 1}`, topFloor, 0, (car) => { this.answered(car); onStop(car); }));
  }

  // A button on a landing. Pressing it twice does not send two cars.
  callFrom(floor: number, direction: Direction): Car {
    const key = `${floor}:${direction}`;
    const already = this.waiting.get(key);
    if (already) return already;
    const car = this.dispatch({ floor, direction }, this.cars);
    this.waiting.set(key, car);
    car.assignHallCall(floor, direction);
    return car;
  }

  tick(): void {
    for (const car of this.cars) car.tick();
  }

  private answered(car: Car): void {
    for (const direction of ["up", "down"] as const) {
      if (car.direction === direction || car.direction === null) {
        const key = `${car.floor}:${direction}`;
        if (this.waiting.get(key) === car) this.waiting.delete(key);
      }
    }
  }
}
