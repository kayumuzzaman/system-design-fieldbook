// The job that varies: how long to wait before retry number `attempt` (counted from 1), in milliseconds.

// The classic form: an interface, and a class for each way of doing the job.
export interface BackoffPolicy {
  delay(attempt: number): number;
}
export class FixedBackoff implements BackoffPolicy {
  private readonly ms: number;
  constructor(ms: number) {
    this.ms = ms;
  }
  delay(): number {
    return this.ms;
  }
}

// The TypeScript form: a strategy with one method is a function.
export type Backoff = (attempt: number) => number;

export const fixed = (ms: number): Backoff => () => ms;
export const exponential = (base: number, cap: number): Backoff => (attempt) => Math.min(cap, base * 2 ** (attempt - 1));
export const jittered = (inner: Backoff, random: () => number = Math.random): Backoff => (attempt) =>
  Math.round(inner(attempt) * random());

// The context: it retries, and has no opinion about how long to wait.
export class Uploader {
  private readonly backoff: Backoff;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(backoff: Backoff, sleep: (ms: number) => Promise<void>) {
    this.backoff = backoff;
    this.sleep = sleep;
  }

  async upload(send: () => Promise<void>, maxAttempts = 4): Promise<number> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await send();
        return attempt;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await this.sleep(this.backoff(attempt));
      }
    }
  }
}
