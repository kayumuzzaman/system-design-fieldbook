// Runs on its own thread. It shares nothing with the main thread: the range arrives as a message.
import { parentPort, workerData } from "node:worker_threads";
import { countPrimes } from "./blocking.ts";

const { from, to } = workerData as { from: number; to: number };
parentPort?.postMessage(countPrimes(from, to));
