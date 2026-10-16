import { MinHeap } from "./heap.ts";

// Where time comes from. Every library in this chapter is given a Clock instead of reading the time itself.
export interface Clock {
  now(): number;
  // Calls `fn` once, at `time` or soon after. Returns a function that cancels the call.
  at(time: number, fn: () => void): () => void;
}

// Node.js turns a setTimeout delay above 2^31 - 1 ms (about 24.8 days) into 1 ms. Longer waits are made in steps.
const LONGEST_TIMEOUT = 2 ** 31 - 1;

export const systemClock: Clock = {
  now: () => Date.now(),
  at(time, fn) {
    let handle: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      const wait = time - Date.now();
      handle = wait > LONGEST_TIMEOUT ? setTimeout(arm, LONGEST_TIMEOUT) : setTimeout(fn, Math.max(0, wait));
    };
    arm();
    return () => clearTimeout(handle);
  },
};

interface Timer {
  readonly at: number;
  readonly seq: number;
  readonly fn: () => void;
  live: boolean;
}

// A clock for tests. Time moves only when the test moves it, and timers fire in time order.
export class FakeClock implements Clock {
  private time: number;
  private seq = 0;
  private readonly timers = new MinHeap<Timer>((a, b) => a.at < b.at || (a.at === b.at && a.seq < b.seq));

  constructor(start = 0) {
    this.time = start;
  }
  now(): number {
    return this.time;
  }
  at(time: number, fn: () => void): () => void {
    const timer: Timer = { at: Math.max(time, this.time), seq: this.seq++, fn, live: true };
    this.timers.push(timer);
    return () => {
      timer.live = false;
    };
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.at(this.time + ms, resolve));
  }
  // Moves time forward to `until`, firing every timer due on the way, and lets the code each one
  // wakes up run to its next wait before moving on.
  async advanceTo(until: number): Promise<void> {
    for (;;) {
      await settle();
      const next = this.timers.peek();
      if (next === undefined || next.at > until) break;
      this.timers.pop();
      this.time = Math.max(this.time, next.at); // a timer that fell due during a jump fires late
      if (next.live) next.fn();
    }
    this.time = Math.max(this.time, until);
    await settle();
  }
  // Moves time forward without firing anything, as when the process was paused or the machine slept.
  jump(ms: number): void {
    this.time += ms;
  }
  get pending(): number {
    return this.timers.size;
  }
}

// Every promise callback that is ready runs before a setImmediate callback does.
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
