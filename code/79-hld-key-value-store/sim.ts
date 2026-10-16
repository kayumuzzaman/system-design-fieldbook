// A discrete-event simulation: callbacks run in order of simulated time, in milliseconds.
// Nothing waits for real time, so a minute of traffic at thousands of requests a second runs in well under a second.
import { MinHeap } from "./heap.ts";

interface Event {
  at: number;
  seq: number; // ties run in the order they were scheduled
  run: () => void;
}

export class Sim {
  now = 0;
  private seq = 0;
  private readonly queue = new MinHeap<Event>((a, b) => a.at < b.at || (a.at === b.at && a.seq < b.seq));

  at(time: number, run: () => void): void {
    this.queue.push({ at: Math.max(time, this.now), seq: this.seq++, run });
  }
  after(delay: number, run: () => void): void {
    this.at(this.now + delay, run);
  }
  run(until: number): void {
    for (;;) {
      const next = this.queue.pop();
      if (!next) return;
      if (next.at > until) {
        this.queue.push(next);
        return;
      }
      this.now = next.at;
      next.run();
    }
  }
}

// Requests arriving at random, on average `perSecond` of them a second (a Poisson process).
export function poisson(sim: Sim, rng: { float(): number }, perSecond: number, from: number, to: number, arrive: (t: number) => void): void {
  if (perSecond <= 0) return;
  const meanGap = 1000 / perSecond;
  let t = from - meanGap * Math.log(1 - rng.float());
  const next = (): void => {
    if (t >= to) return;
    sim.at(t, () => {
      arrive(t);
      t += -meanGap * Math.log(1 - rng.float());
      next();
    });
  };
  next();
}
