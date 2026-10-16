import { NodeHeap } from "./heap.ts";

// A deterministic clock for concurrent code: `await sim.sleep(ms)` resumes in order of virtual time,
// so racing requests interleave the same way on every run, however fast the machine is.
export class Sim {
  now = 0;
  private readonly timers = new NodeHeap();
  private readonly wakers: (() => void)[] = [];
  private seq = 0;
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.wakers[this.seq] = resolve;
      this.timers.push(this.now + ms + this.seq * 1e-9, this.seq);   // ties broken by order of request
      this.seq += 1;
    });
  }
  async run(): Promise<void> {
    while (this.timers.size > 0) {
      this.now = Math.round(this.timers.topKey() * 1e6) / 1e6;
      const id = this.timers.pop();
      (this.wakers[id] as () => void)();
      await new Promise((r) => setImmediate(r));                      // let the woken code run until it waits again
    }
  }
}
