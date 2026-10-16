// A measurement, not a test: run with `node --expose-gc memory.ts`. Bytes of memory used for each client's state,
// with a limit of 100 requests a minute and every client at its limit. Results depend on the engine.
import { fixedWindow, gcra, slidingCounter, slidingLog, tokenBucket, type Algorithm } from "./algorithms.ts";

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with node --expose-gc");
const clients = 100_000;
const measure = (algorithm: Algorithm<unknown>): number => {
  gc(); gc();
  const before = process.memoryUsage().heapUsed;
  const states = new Map<number, unknown>();
  for (let c = 0; c < clients; c += 1) {
    let state = algorithm.start(0);
    for (let i = 0; i < 100; i += 1) state = algorithm.decide(state, i * 100, 1).next; // 100 requests over ten seconds
    states.set(c, state);
  }
  gc(); gc();
  const bytes = (process.memoryUsage().heapUsed - before) / clients;
  states.clear();
  return Math.round(bytes);
};
const result: Record<string, number> = {};
for (const make of [tokenBucket, gcra, fixedWindow, slidingCounter, slidingLog]) {
  const algorithm = make(100, 60_000) as Algorithm<unknown>;
  result[algorithm.name] = measure(algorithm);
}
console.log(JSON.stringify(result));
