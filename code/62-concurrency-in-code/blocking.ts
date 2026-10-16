import { setImmediate as nextTurn } from "node:timers/promises";

const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
  return true;
};

// CPU-bound work, done in one go. Nothing else can run on this thread until it returns.
export function countPrimes(from: number, to: number): number {
  let count = 0;
  for (let n = from; n < to; n += 1) if (isPrime(n)) count += 1;
  return count;
}

// The same work in slices. After each slice it lets the event loop run whatever is waiting.
export async function countPrimesPolitely(from: number, to: number, slice = 20_000): Promise<number> {
  let count = 0;
  for (let start = from; start < to; start += slice) {
    count += countPrimes(start, Math.min(to, start + slice));
    await nextTurn();
  }
  return count;
}

// Sets a timer for `due` ms, runs the work, and reports how many ms late the timer fired.
export async function latenessDuring(work: () => unknown, due = 10): Promise<number> {
  const started = performance.now();
  const fired = new Promise<number>((resolve) => setTimeout(() => resolve(performance.now() - started - due), due));
  await work();
  return Math.max(0, Math.round(await fired));
}
