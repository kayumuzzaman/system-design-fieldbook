// A measurement, not a test: run with `node mapfront.ts`. It asks why the Map-based cache slows down when large.
// A Map of n entries is used as a queue: remove the first key, add a new one. In the first loop the first key is
// found with keys().next(), as the Map-based LRU does. In the second, the same keys are deleted without asking.
for (const n of [1000, 10_000, 100_000]) {
  const ops = 200_000;
  const asked = new Map<number, number>();
  for (let i = 0; i < n; i += 1) asked.set(i, i);
  let next = n;
  let start = performance.now();
  for (let i = 0; i < ops; i += 1) {
    asked.delete(asked.keys().next().value as number);
    asked.set((next += 1), 1);
  }
  const withAsking = ((performance.now() - start) * 1e6) / ops;

  const known = new Map<number, number>();
  for (let i = 0; i < n; i += 1) known.set(i, i);
  next = n;
  let victim = 0;
  start = performance.now();
  for (let i = 0; i < ops; i += 1) {
    known.delete(victim);
    victim += 1;
    known.set((next += 1), 1);
  }
  const withoutAsking = ((performance.now() - start) * 1e6) / ops;
  console.log(`${n} entries: finding the first key, then delete and set: ${withAsking.toFixed(0)} ns | delete and set alone: ${withoutAsking.toFixed(0)} ns`);
}
