import { exponential, percentile, seeded } from "./random.ts";

// A simulated inference server. Time is simulated, so a run is instant and gives the same answer every time.
//
// The cost of one pass of the model (one "iteration") is a fixed part, the time to read the model's weights
// from memory, plus a small part for each sequence in the batch, plus prefill work for each prompt that joins.
// One iteration produces one new token for every sequence in the batch.
export interface CostModel {
  stepMs: number;          // fixed cost of one iteration, whatever the batch size
  perSequenceMs: number;   // added cost of each sequence in the batch
  prefillPerTokenMs: number; // cost of reading one prompt token when a request joins
}
export const SMALL_MODEL: CostModel = { stepMs: 6, perSequenceMs: 0.1, prefillPerTokenMs: 0.03 };

export interface Job { id: number; arrival: number; input: number; output: number }
export interface Served extends Job { firstToken: number; done: number }
export type Policy = "static" | "continuous";
// What one slot of the batch held during one iteration: a sequence producing a token, a finished one still
// taking up its place (padding), or nothing.
export type Cell = { id: number; padding: boolean } | null;
export interface Run { served: Served[]; iterations: number; slots: Cell[][] }

// Static batching: take up to `maxBatch` waiting requests, run them together until the longest is finished,
// and only then look at the queue again. Continuous batching decides at every iteration: finished sequences
// leave and waiting ones take their places at once.
export function simulate(jobs: readonly Job[], policy: Policy, maxBatch: number, cost: CostModel = SMALL_MODEL, keepSlots = false): Run {
  const queue = [...jobs].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  const served: Served[] = [];
  const slots: (Job | null)[] = Array.from({ length: maxBatch }, () => null);
  const made = new Map<number, number>();     // tokens produced so far, by job id
  const first = new Map<number, number>();
  const history: Cell[][] = [];
  const out = new Set<number>();
  let next = 0, t = 0, iterations = 0;
  const running = () => slots.filter((s): s is Job => s !== null);

  while (next < queue.length || running().length > 0) {
    const mayJoin = policy === "continuous" || running().length === 0;
    if (running().length === 0 && next < queue.length && (queue[next] as Job).arrival > t) t = (queue[next] as Job).arrival;
    let prefill = 0;
    if (mayJoin) {
      for (let i = 0; i < maxBatch && next < queue.length && (queue[next] as Job).arrival <= t; i += 1) {
        if (slots[i] !== null) continue;
        const job = queue[next++] as Job;
        slots[i] = job;
        made.set(job.id, 0);
        prefill += job.input;
      }
    }
    // One iteration: every occupied slot produces a token. A static batch keeps paying for its finished
    // sequences, which sit in the batch as padding until the longest one is done.
    const occupied = running();
    t += cost.stepMs + cost.perSequenceMs * occupied.length + cost.prefillPerTokenMs * prefill;
    iterations += 1;
    if (keepSlots) history.push(slots.map((s) => (s ? { id: s.id, padding: (made.get(s.id) as number) >= s.output } : null)));
    for (const job of occupied) {
      const n = made.get(job.id) as number;
      if (n < job.output) {
        made.set(job.id, n + 1);
        if (n === 0) first.set(job.id, t);
      }
    }
    // A sequence is done for its user when its last token is out. Under continuous batching its slot is free
    // for the next iteration; under static batching the slot stays taken until the whole batch is done.
    const finished = (j: Job) => (made.get(j.id) as number) >= j.output;
    slots.forEach((s, i) => {
      if (!s || !finished(s)) return;
      if (!out.has(s.id)) { out.add(s.id); served.push({ ...s, firstToken: first.get(s.id) as number, done: t }); }
      if (policy === "continuous") slots[i] = null;
    });
    if (policy === "static" && occupied.every(finished)) slots.fill(null);
  }
  return { served, iterations, slots: history };
}

export interface Summary {
  requests: number;
  tokensPerSecond: number;   // output tokens per second for the whole server
  ttftP50: number; ttftP95: number; // time to first token, ms
  perUserTokensPerSecond: number;   // median speed at which one user sees tokens arrive
  endToEndP50: number;
}
export function summarize(run: Run): Summary {
  const s = run.served;
  const start = Math.min(...s.map((x) => x.arrival)), end = Math.max(...s.map((x) => x.done));
  const tokens = s.reduce((a, x) => a + x.output, 0);
  const ttft = s.map((x) => x.firstToken - x.arrival);
  const speed = s.filter((x) => x.output > 1).map((x) => ((x.output - 1) / (x.done - x.firstToken)) * 1000);
  return {
    requests: s.length,
    tokensPerSecond: (tokens / (end - start)) * 1000,
    ttftP50: percentile(ttft, 50), ttftP95: percentile(ttft, 95),
    perUserTokensPerSecond: percentile(speed, 50),
    endToEndP50: percentile(s.map((x) => x.done - x.arrival), 50),
  };
}

// Requests arriving independently at `rate` a second for `seconds`. Prompts are 500 to 2,500 tokens long;
// answers are 50 tokens plus a random length that averages 200, at most 1,000 in all.
export function workload(rate: number, seconds: number, seed = 100): Job[] {
  const random = seeded(seed);
  const jobs: Job[] = [];
  for (let t = exponential(rate, random) * 1000, id = 0; t < seconds * 1000; t += exponential(rate, random) * 1000, id += 1) {
    const input = 500 + Math.floor(random() * 2001);
    const output = Math.min(1000, 50 + Math.floor(exponential(1 / 200, random)));
    jobs.push({ id, arrival: t, input, output });
  }
  return jobs;
}
