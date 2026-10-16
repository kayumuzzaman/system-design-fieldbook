// A model of a pastebin's traffic, for questions the arithmetic cannot answer, such as how big a cache must be.
// Every number in it is an assumption, and the chapter says so: pastes arrive at a steady rate, each is read a number
// of times drawn from a heavy-tailed distribution, and its reads come soon after it is created.
import { exponential, lognormalCount, seeded } from "./random.ts";

export interface WorkloadOptions {
  readonly pastesPerDay: number; // at the scale simulated
  readonly days: number;
  readonly readsPerPaste: number; // average
  readonly sigma: number; // spread of the number of reads: 2 means half of pastes are read 3 times or fewer
  readonly delayHours: number; // average time from creation to a read
  readonly seed: number;
}

export const MODEL: Omit<WorkloadOptions, "pastesPerDay" | "days" | "seed"> = {
  readsPerPaste: 20,
  sigma: 2,
  delayHours: 6,
};

export interface Workload {
  readonly options: WorkloadOptions;
  readonly pastes: number;
  readonly createdAt: Float64Array; // seconds from the start, in increasing order; a paste's id is its index
  readonly seconds: number;
  readonly readStart: Int32Array; // reads in second s are readIds[readStart[s] .. readStart[s + 1])
  readonly readIds: Int32Array;
  readonly readsPerPasteDrawn: Int32Array; // how many reads each paste was given, including any after the end
}

export function generate(o: WorkloadOptions): Workload {
  const random = seeded(o.seed);
  const seconds = Math.round(o.days * 86_400);
  const meanGap = 86_400 / o.pastesPerDay;
  const created: number[] = [];
  for (let t = exponential(random, meanGap); t < seconds; t += exponential(random, meanGap)) created.push(t);
  const createdAt = Float64Array.from(created);
  const drawn = new Int32Array(createdAt.length);
  const readSecond: number[] = [];
  const readId: number[] = [];
  const meanDelay = o.delayHours * 3600;
  for (let id = 0; id < createdAt.length; id += 1) {
    const k = lognormalCount(random, o.readsPerPaste, o.sigma);
    drawn[id] = k;
    for (let i = 0; i < k; i += 1) {
      const at = (createdAt[id] as number) + exponential(random, meanDelay);
      if (at < seconds) {
        readSecond.push(Math.floor(at));
        readId.push(id);
      }
    }
  }
  // Counting sort by second: reads end up in time order, to the second.
  const readStart = new Int32Array(seconds + 1);
  for (const s of readSecond) readStart[s + 1] = (readStart[s + 1] as number) + 1;
  for (let s = 0; s < seconds; s += 1) readStart[s + 1] = (readStart[s + 1] as number) + (readStart[s] as number);
  const next = readStart.slice(0, seconds);
  const readIds = new Int32Array(readSecond.length);
  for (let i = 0; i < readSecond.length; i += 1) {
    const s = readSecond[i] as number;
    readIds[next[s] as number] = readId[i] as number;
    next[s] = (next[s] as number) + 1;
  }
  return { options: o, pastes: createdAt.length, createdAt, seconds, readStart, readIds, readsPerPasteDrawn: drawn };
}

// Walks the workload in time order. Within each second, pastes created in it come before the reads in it.
export function replay(w: Workload, onCreate: (id: number, second: number) => void, onRead: (id: number, second: number) => void): void {
  let nextPaste = 0;
  for (let s = 0; s < w.seconds; s += 1) {
    while (nextPaste < w.pastes && (w.createdAt[nextPaste] as number) < s + 1) onCreate(nextPaste++, s);
    const end = w.readStart[s + 1] as number;
    for (let i = w.readStart[s] as number; i < end; i += 1) onRead(w.readIds[i] as number, s);
  }
}
