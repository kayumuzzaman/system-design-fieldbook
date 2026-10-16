// Points and a tie-breaker packed into one number, because a sorted set orders by one number.
// More points rank higher; with equal points, whoever reached them first ranks higher.
// A month has at most 2,678,400 seconds, which fits in 22 bits, and a double holds integers
// exactly up to 2^53, so points up to 2^31 can be packed without losing anything.
export const SLOT = 2 ** 22;

export function packed(points: number, secondsIntoMonth: number): number {
  if (!Number.isInteger(points) || points < 0 || points >= 2 ** 31) throw new RangeError("points out of range");
  if (!Number.isInteger(secondsIntoMonth) || secondsIntoMonth < 0 || secondsIntoMonth >= SLOT) throw new RangeError("time out of range");
  return points * SLOT + (SLOT - 1 - secondsIntoMonth);
}
export function pointsOf(score: number): number {
  return Math.floor(score / SLOT);
}
