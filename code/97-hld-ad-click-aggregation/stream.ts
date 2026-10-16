// The streaming aggregator: clicks per ad per one-minute window of event time.
// It removes repeated click ids it has seen recently, closes a window when the watermark passes its end,
// and either drops a click that arrives after that or, within a grace period, emits a corrected count.
import type { Click } from "./clicks.ts";

export interface StreamConfig {
  readonly windowMs: number;
  readonly delayMs: number;    // the watermark trails the newest event time by this much
  readonly graceMs: number;    // after closing, a window still accepts late clicks for this long (0: drop them)
  readonly dedupMs: number;    // a click id is remembered for this long after it first arrived
}

export interface Result { readonly ad: number; readonly window: number; readonly count: number; readonly at: number; readonly kind: "first" | "correction" }

export class WindowedCounter {
  private readonly c: StreamConfig;
  private readonly open = new Map<number, Map<number, number>>();   // window start -> ad -> count
  private readonly closed = new Set<number>();                        // windows already emitted, still within grace
  private readonly seen = new Map<number, number>();                  // click id -> arrival time
  private readonly seenOrder: number[] = [];
  private seenHead = 0;
  private watermark = -Infinity;
  private newest = -Infinity;
  readonly results: Result[] = [];
  readonly stats = { counted: 0, duplicates: 0, dropped: 0, corrections: 0, dedupPeak: 0 };

  constructor(c: StreamConfig) { this.c = c; }

  add(click: Click): void {
    // forget ids older than the dedup period, oldest first
    while (this.seenHead < this.seenOrder.length) {
      const id = this.seenOrder[this.seenHead] as number;
      if ((this.seen.get(id) as number) > click.arrival - this.c.dedupMs) break;
      this.seen.delete(id); this.seenHead += 1;
    }
    if (this.seen.has(click.id)) { this.stats.duplicates += 1; return; }
    this.seen.set(click.id, click.arrival); this.seenOrder.push(click.id);
    if (this.seen.size > this.stats.dedupPeak) this.stats.dedupPeak = this.seen.size;

    const start = click.time - (click.time % this.c.windowMs);
    const end = start + this.c.windowMs;
    if (end <= this.watermark && !this.closed.has(start)) { this.stats.dropped += 1; }
    else {
      const counts = this.open.get(start) ?? new Map<number, number>();
      const n = (counts.get(click.ad) ?? 0) + 1;
      counts.set(click.ad, n);
      this.open.set(start, counts);
      this.stats.counted += 1;
      if (this.closed.has(start)) {   // a late click inside the grace period: the count is revised
        this.results.push({ ad: click.ad, window: start, count: n, at: click.arrival, kind: "correction" });
        this.stats.corrections += 1;
      }
    }
    if (click.time > this.newest) { this.newest = click.time; this.advance(this.newest - this.c.delayMs, click.arrival); }
  }

  private advance(watermark: number, now: number): void {
    if (watermark <= this.watermark) return;
    this.watermark = watermark;
    for (const [start, counts] of this.open) {
      const end = start + this.c.windowMs;
      if (end <= watermark && !this.closed.has(start)) {
        for (const [ad, count] of counts) this.results.push({ ad, window: start, count, at: now, kind: "first" });
        this.closed.add(start);
      }
      if (end + this.c.graceMs <= watermark) { this.open.delete(start); this.closed.delete(start); }
    }
  }

  // End of the input: close everything (used only to finish a simulation).
  finish(now: number): void { this.advance(Infinity, now); }
}

// What a store holding the results ends up with: the latest count for each ad and window.
export function latest(results: readonly Result[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of results) m.set(`${r.ad}@${r.window}`, r.count);
  return m;
}
