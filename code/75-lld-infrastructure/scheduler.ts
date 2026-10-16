import type { Backoff } from "./backoff.ts";
import type { Clock } from "./clock.ts";
import { MinHeap } from "./heap.ts";

// What to do about runs of a periodic task that fell due while it could not run.
export type Missed = "catch-up" | "once" | "skip";

export interface TaskOptions {
  readonly name?: string;
  readonly every?: number; // the period, in ms, of a periodic task
  readonly missed?: Missed; // default "once"
  readonly retry?: { readonly attempts: number; readonly backoff: Backoff }; // attempts include the first
}
export interface Run {
  readonly due: number; // the time this run was scheduled for
  readonly attempt: number;
}
export type TaskFn = (run: Run) => void | Promise<void>;

interface Task {
  readonly name: string;
  readonly fn: TaskFn;
  readonly options: TaskOptions;
  canceled: boolean;
}
interface Entry {
  readonly at: number; // when to start
  readonly seq: number; // ties go to the entry added first
  readonly task: Task;
  readonly due: number;
  readonly attempt: number;
}

export class Scheduler {
  private readonly clock: Clock;
  private readonly limit: number;
  private readonly onError: (error: unknown, task: string) => void;
  private readonly heap = new MinHeap<Entry>((a, b) => a.at < b.at || (a.at === b.at && a.seq < b.seq));
  private seq = 0;
  private running = 0;
  private disarm: (() => void) | null = null;

  constructor(clock: Clock, options: { concurrency: number; onError: (error: unknown, task: string) => void }) {
    this.clock = clock;
    this.limit = options.concurrency;
    this.onError = options.onError;
  }

  at(time: number, fn: TaskFn, options: TaskOptions = {}): { cancel(): void } {
    const task: Task = { name: options.name ?? "task", fn, options, canceled: false };
    this.push(task, time, time, 1);
    this.wake();
    return { cancel: () => void (task.canceled = true) }; // its entries are skipped when they reach the top
  }
  after(delay: number, fn: TaskFn, options: TaskOptions = {}) {
    return this.at(this.clock.now() + delay, fn, options);
  }
  every(period: number, fn: TaskFn, options: TaskOptions = {}) {
    return this.at(this.clock.now() + period, fn, { ...options, every: period });
  }

  private push(task: Task, at: number, due: number, attempt: number): void {
    this.heap.push({ at, seq: this.seq++, task, due, attempt });
  }

  // Starts what is due, as far as the concurrency limit allows, then sets one timer, for the earliest entry.
  private wake(): void {
    this.disarm?.();
    this.disarm = null;
    const now = this.clock.now();
    for (let top = this.heap.peek(); top !== undefined && top.at <= now && this.running < this.limit; top = this.heap.peek()) {
      this.heap.pop();
      if (!top.task.canceled) this.start(top, now);
    }
    const next = this.heap.peek();
    if (next !== undefined && this.running < this.limit) this.disarm = this.clock.at(next.at, () => this.wake());
  }

  private start(entry: Entry, now: number): void {
    const { task, attempt } = entry;
    let due = entry.due;
    const period = task.options.every;
    if (period !== undefined && attempt === 1 && now >= due + period) {
      // The next run is already due, so this one was missed: the process was paused, or the last run overran.
      const latest = due + Math.floor((now - due) / period) * period;
      const policy = task.options.missed ?? "once";
      if (policy === "skip") return this.push(task, latest + period, latest + period, 1); // wait for the next one
      if (policy === "once") due = latest; // one run stands for all the missed ones
      // "catch-up" runs this one as it is, and the next will be found missed too, until the task is on time again
    }
    this.running += 1;
    Promise.resolve()
      .then(() => task.fn({ due, attempt }))
      .then(
        () => this.finish(task, due, attempt, false),
        (error: unknown) => this.finish(task, due, attempt, true, error),
      );
  }

  private finish(task: Task, due: number, attempt: number, failed: boolean, error?: unknown): void {
    this.running -= 1;
    const { retry, every } = task.options;
    if (failed && retry !== undefined && attempt < retry.attempts && !task.canceled) {
      this.push(task, this.clock.now() + retry.backoff(attempt), due, attempt + 1);
    } else {
      if (failed) this.report(error, task.name); // this run has used all its attempts
      // The next run is added only now, so a periodic task never overlaps itself, and a failure never ends its schedule.
      if (every !== undefined && !task.canceled) this.push(task, due + every, due + every, 1);
    }
    this.wake();
  }

  private report(error: unknown, task: string): void {
    try {
      this.onError(error, task);
    } catch {
      // a broken error handler must not stop the scheduler
    }
  }

  get waiting(): number {
    return this.heap.size;
  }
}
