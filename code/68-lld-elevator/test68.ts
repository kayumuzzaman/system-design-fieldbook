import assert from "node:assert/strict";
import { Car, ElevatorError } from "./car.ts";
import { ElevatorSystem, nearestCar, roundRobin, soonestArrival, type Dispatch } from "./system.ts";
import { fcfsOrder, floorsTraveled, lookOrder } from "./travel.ts";
import { crowd, simulate } from "./sim.ts";

// --- two orders for one car: start at floor 5, buttons pressed in this order
const pressed = [12, 2, 9, 1, 14, 3, 10];
const fcfs = fcfsOrder(pressed), look = lookOrder(5, pressed);
assert.deepEqual(look, [9, 10, 12, 14, 3, 2, 1]);
assert.equal(floorsTraveled(5, fcfs), 63); assert.equal(floorsTraveled(5, look), 22);
assert.equal(floorsTraveled(5, lookOrder(5, pressed, "down")), 17);
console.log(`order: first come first served ${JSON.stringify(fcfs)} travels ${floorsTraveled(5, fcfs)} floors | LOOK ${JSON.stringify(look)} travels ${floorsTraveled(5, look)} | LOOK starting downward ${floorsTraveled(5, lookOrder(5, pressed, "down"))}`);

// --- one car, tick by tick: the scenario in the chapter's figure
const stops: string[] = [];
let now = 0;
const car = new Car("car 1", 9, 2, (c) => stops.push(`t${now} floor ${c.floor} ${c.direction ?? "resting"}`));
car.pressFloor(7); car.assignHallCall(4, "up"); car.assignHallCall(5, "down"); car.assignHallCall(8, "down");
const going: Record<string, number> = { "4:up": 9, "8:down": 1, "5:down": 0 };
let seen = 0;
while ((car.pending > 0 || car.state !== "idle") && now < 200) {
  const before = { floor: car.floor, state: car.state };
  now += 1; car.tick();
  if (before.state !== "moving") assert.equal(car.floor, before.floor);                         // a car that is not in the moving state does not move
  assert.ok(car.floor >= 0 && car.floor <= 9);
  for (; seen < stops.length; seen += 1) {
    const [, , floor, direction] = (stops[seen] as string).split(" ");
    const to = going[`${floor}:${direction}`];
    if (to !== undefined) { car.pressFloor(to); delete going[`${floor}:${direction}`]; }
  }
}
assert.deepEqual(stops, ["t3 floor 4 up", "t8 floor 7 up", "t12 floor 9 down", "t15 floor 8 down", "t20 floor 5 down", "t26 floor 1 down", "t29 floor 0 resting"]);
assert.equal(car.state, "idle"); assert.equal(car.direction, null); assert.deepEqual(going, {});
assert.throws(() => car.pressFloor(10), ElevatorError); assert.throws(() => car.assignHallCall(-1, "up"), /there is no floor -1/);
console.log("one car: " + stops.join(" | "));

// --- the two exercises at the end of the chapter
assert.equal(floorsTraveled(6, fcfsOrder([2, 9, 4, 12, 7])), 29); assert.deepEqual(lookOrder(6, [2, 9, 4, 12, 7]), [7, 9, 12, 4, 2]); assert.equal(floorsTraveled(6, lookOrder(6, [2, 9, 4, 12, 7])), 16);
const quiz: number[] = []; const q = new Car("q", 9, 3, (c) => quiz.push(c.floor));
q.pressFloor(8); q.assignHallCall(5, "down"); q.assignHallCall(6, "up");
for (let i = 0; i < 40; i += 1) q.tick();
assert.deepEqual(quiz, [6, 8, 5]);

// --- an idle car called to where it stands opens at once, and a call the other way waits for the turn
const idle = new Car("c", 9, 3); let opened = 0; const c2 = new Car("c2", 9, 3, () => { opened += 1; });
idle.assignHallCall(3, "up"); idle.tick(); assert.equal(idle.state, "doorsOpen"); assert.equal(idle.floor, 3);
c2.assignHallCall(3, "down"); c2.tick(); c2.assignHallCall(3, "down"); assert.equal(opened, 2); // pressing again while the doors are open holds them
assert.equal(new Car("c3", 9, 0).ticksToServe(6, "up"), 7); assert.equal(c2.ticksToServe(3, "down"), 0);

// --- the system: one button, one car, and each strategy chooses differently
const system = new ElevatorSystem(3, 19, soonestArrival);
const first = system.callFrom(12, "down"); assert.equal(system.callFrom(12, "down"), first);    // pressing twice sends one car
const pick = (dispatch: Dispatch) => {
  const s = new ElevatorSystem(2, 19, dispatch);
  s.cars[0]?.pressFloor(19); for (let i = 0; i < 9; i += 1) s.tick();                           // car 1 is at floor 8, going up to 19
  s.cars[1]?.pressFloor(2); for (let i = 0; i < 4; i += 1) s.tick();                            // car 2 has stopped at floor 2 and is idle
  return { car1: s.cars[0]?.floor, car2: s.cars[1]?.floor, chosen: s.callFrom(9, "down").id };
};
const byNearest = pick(nearestCar), bySoonest = pick(soonestArrival);
assert.equal(byNearest.chosen, "car 1"); assert.equal(bySoonest.chosen, "car 2");
console.log(`dispatch: car 1 at floor ${byNearest.car1} going up to 19, car 2 idle at floor ${byNearest.car2}; a down call from 9 goes to ${byNearest.chosen} by nearest and to ${bySoonest.chosen} by soonest arrival`);

// --- invariants and liveness under random traffic, for every strategy
const strategies: [string, () => Dispatch][] = [["round robin", roundRobin], ["nearest car", () => nearestCar], ["soonest arrival", () => soonestArrival]];
const results: Record<string, Record<string, ReturnType<typeof simulate>>> = {};
const workloads = { "mixed traffic": crowd(300, 19, 900, 68), "morning rush": crowd(300, 19, 900, 68, 0.85) };
for (const [workload, people] of Object.entries(workloads)) {
  results[workload] = {};
  for (const [name, make] of strategies) {
    const outcome = simulate(3, 19, make(), people);
    assert.equal(outcome.delivered, people.length, `${name}: everyone arrives`);
    assert.equal(outcome.wrongWay, 0);
    (results[workload] as Record<string, typeof outcome>)[name] = outcome;
  }
}
for (const [workload, table] of Object.entries(results)) {
  console.log(`${workload}: ` + Object.entries(table).map(([name, o]) => `${name}: average wait ${o.averageWait.toFixed(1)}, longest ${o.longestWait}, average journey ${o.averageJourney.toFixed(1)}`).join(" | "));
}
const mixed = results["mixed traffic"] as Record<string, ReturnType<typeof simulate>>;
assert.ok((mixed["soonest arrival"]?.averageWait ?? 0) < (mixed["round robin"]?.averageWait ?? 0));
// one car against three, same people
const single = simulate(1, 19, nearestCar, workloads["mixed traffic"]);
assert.equal(single.delivered, 300);
console.log(`one car alone: average wait ${single.averageWait.toFixed(1)}, longest ${single.longestWait}`);
if (process.argv.includes("--json")) console.log("JSON " + JSON.stringify({ results, single }));
console.log("all assertions passed");
