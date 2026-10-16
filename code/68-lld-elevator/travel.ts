// Two orders in which one car could visit a list of requested floors. Each returns the floors in the order visited.

// First come, first served: the order the buttons were pressed.
export const fcfsOrder = (requests: readonly number[]): number[] => [...requests];

// LOOK: keep going in one direction to the furthest request, then turn and take the rest on the way back.
export function lookOrder(start: number, requests: readonly number[], first: "up" | "down" = "up"): number[] {
  const above = requests.filter((f) => f > start).sort((a, b) => a - b);
  const below = requests.filter((f) => f < start).sort((a, b) => b - a);
  const here = requests.filter((f) => f === start);
  return first === "up" ? [...here, ...above, ...below] : [...here, ...below, ...above];
}

export const floorsTraveled = (start: number, order: readonly number[]): number =>
  order.reduce((sum, floor, i) => sum + Math.abs(floor - (i === 0 ? start : (order[i - 1] as number))), 0);
