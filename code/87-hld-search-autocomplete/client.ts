// The browser side: wait for a pause in typing, number each request, and show only answers
// newer than what is on screen. The timer and the fetch are passed in, so a test can drive them.
export type Fetch = (prefix: string, seq: number) => Promise<{ seq: number; suggestions: string[] }>;
export type Timer = { set(fn: () => void, ms: number): number; clear(id: number): void };

export class Suggester {
  private readonly fetch: Fetch;
  private readonly timer: Timer;
  private readonly waitMs: number;
  private pending: number | null = null;
  private nextSeq = 1;
  private shownSeq = 0;
  private readonly cache = new Map<string, string[]>();
  shown: string[] = [];
  requests = 0;
  constructor(fetch: Fetch, timer: Timer, waitMs = 60) {
    this.fetch = fetch;
    this.timer = timer;
    this.waitMs = waitMs;
  }

  // Called on every keystroke with the whole text typed so far.
  typed(prefix: string): void {
    if (this.pending !== null) this.timer.clear(this.pending); // a new key cancels the wait
    const seq = this.nextSeq++;
    const known = this.cache.get(prefix);
    if (known) { this.show(seq, known); return; } // deleting a letter costs nothing
    this.pending = this.timer.set(() => {
      this.pending = null;
      this.requests += 1;
      this.fetch(prefix, seq).then((r) => {
        this.cache.set(prefix, r.suggestions);
        this.show(r.seq, r.suggestions);
      }, () => {}); // a failed lookup leaves the box working, without suggestions
    }, this.waitMs);
  }

  private show(seq: number, suggestions: string[]): void {
    if (seq <= this.shownSeq) return; // an answer older than what is on screen
    this.shownSeq = seq;
    this.shown = suggestions;
  }
}
