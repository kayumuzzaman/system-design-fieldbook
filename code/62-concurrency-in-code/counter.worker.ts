// Adds one to a shared counter many times, either with a plain read-then-write or with an atomic operation.
import { parentPort, workerData } from "node:worker_threads";

const { shared, times, atomic } = workerData as { shared: SharedArrayBuffer; times: number; atomic: boolean };
const counter = new Int32Array(shared);
for (let i = 0; i < times; i += 1) {
  if (atomic) Atomics.add(counter, 0, 1);
  else counter[0] = (counter[0] as number) + 1; // read, add, write: three steps another thread can interleave with
}
parentPort?.postMessage("done");
