// Transcoding one upload into every rung of the ladder, on a pool of workers.
// A job encodes one stretch of the video into one rung. Jobs go to whichever worker is free first.
import { MinHeap } from './heap.ts';
import { LADDER, SEGMENT, type Rung } from './abr.ts';
import { Rng } from './rng.ts';

// The cost of encoding, in core-seconds for each second of video, is an assumption: proportional to the
// pixels of the rung, with 3.2 for 1080p, plus 0.3 for decoding the source, which every job must do.
const PIXELS_1080 = 1920 * 1080;
const WIDTH: Record<number, number> = { 234: 416, 360: 640, 432: 768, 540: 960, 720: 1280, 1080: 1920 };
export function encodeCost(rung: Rung): number {
  return 0.3 + 3.2 * (WIDTH[rung.height] as number) * rung.height / PIXELS_1080;
}
export const LADDER_COST = LADDER.reduce((a, r) => a + encodeCost(r), 0);   // core-seconds per second, all rungs

export type Plan = {
  readonly chunk: number | 'whole';  // seconds of video in a job, or the whole file for each rung
  readonly workers: number;
  readonly order: 'largest first' | 'lowest rungs first';
};
export const JOB_OVERHEAD = 4;       // seconds per job: start, fetch the source stretch, upload the result
export const SPLIT_RATE = 50;        // seconds of video the splitter cuts per second, copying without decoding
export const ASSEMBLE = 5;           // seconds to check the outputs and write the playlists

export type Run = {
  readonly wall: number;             // seconds from the upload completing to every rung being ready
  readonly coreSeconds: number;      // the work done, overhead included
  readonly playable: number;         // seconds until the three lowest rungs are ready, enough to publish
  readonly jobs: number;
};

// Scene complexity varies along a video; each 6-second segment gets a factor with mean 1.
export function complexity(seconds: number, seed: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: Math.ceil(seconds / SEGMENT) }, () => Math.exp(0.35 * rng.normal() - 0.35 * 0.35 / 2));
}

export function transcode(seconds: number, plan: Plan, scenes: readonly number[]): Run {
  type Job = { rung: number; from: number; to: number; time: number };
  const jobs: Job[] = [];
  const span = plan.chunk === 'whole' ? seconds : plan.chunk;
  for (let r = 0; r < LADDER.length; r++) {
    for (let from = 0; from < seconds; from += span) {
      const to = Math.min(seconds, from + span);
      let work = 0;     // core-seconds, following the complexity of each segment the job covers
      for (let s = from; s < to; s += SEGMENT) work += Math.min(SEGMENT, to - s) * (scenes[Math.floor(s / SEGMENT)] as number);
      jobs.push({ rung: r, from, to, time: JOB_OVERHEAD + work * encodeCost(LADDER[r] as Rung) });
    }
  }
  // The scheduler knows each job's size only roughly (by length and rung), and orders the queue by it.
  const guess = (j: Job) => (j.to - j.from) * encodeCost(LADDER[j.rung] as Rung);
  if (plan.order === 'largest first') jobs.sort((a, b) => guess(b) - guess(a) || a.from - b.from);
  else jobs.sort((a, b) => a.rung - b.rung || a.from - b.from);
  const split = plan.chunk === 'whole' ? 0 : seconds / SPLIT_RATE;
  const free = new MinHeap<number>((a, b) => a < b);
  for (let w = 0; w < plan.workers; w++) free.push(split);
  const doneByRung = new Array<number>(LADDER.length).fill(0);
  let end = 0, core = 0;
  for (const j of jobs) {
    const start = free.pop() as number, finish = start + j.time;
    free.push(finish);
    end = Math.max(end, finish);
    doneByRung[j.rung] = Math.max(doneByRung[j.rung] as number, finish);
    core += j.time;
  }
  const playable = Math.max(doneByRung[0] as number, doneByRung[1] as number, doneByRung[2] as number) + ASSEMBLE;
  return { wall: end + ASSEMBLE, coreSeconds: core + split, playable, jobs: jobs.length };
}
