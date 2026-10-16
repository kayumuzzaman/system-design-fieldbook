import { Worker } from "node:worker_threads";

const runWorker = <R>(file: string, workerData: unknown): Promise<R> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL(file, import.meta.url), { workerData });
    worker.once("message", resolve);
    worker.once("error", reject);
  });

// Splits the range into equal parts and counts each part on its own thread.
export async function countPrimesOnThreads(limit: number, threads: number): Promise<number> {
  const size = Math.ceil(limit / threads);
  const parts = Array.from({ length: threads }, (_, i) => ({ from: i * size, to: Math.min(limit, (i + 1) * size) }));
  const counts = await Promise.all(parts.map((part) => runWorker<number>("./primes.worker.ts", part)));
  return counts.reduce((sum, count) => sum + count, 0);
}

// Starts `threads` workers that each add one to the same shared counter `times` times.
export async function countTogether(threads: number, times: number, atomic: boolean): Promise<number> {
  const shared = new SharedArrayBuffer(4);
  await Promise.all(Array.from({ length: threads }, () => runWorker("./counter.worker.ts", { shared, times, atomic })));
  return new Int32Array(shared)[0] as number;
}
