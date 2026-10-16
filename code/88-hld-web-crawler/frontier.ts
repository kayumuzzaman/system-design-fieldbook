import { MinHeap } from "./heap.ts";

export type Next = { readonly url: string; readonly host: string; readonly start: number };

// The URL frontier: what to fetch next, and when it may be fetched.
export interface Frontier {
  add(url: string, host: string): void;
  next(now: number): Next | null; // for a fetcher that is free at `now`
  earliest(): number | null; // when the next URL may start: a fetcher need not wait for it
  fetched(host: string, end: number): void; // the fetch just handed out ends at `end`
  size(): number;
}

// One first-in, first-out queue for everything. With `polite`, a URL whose host was fetched
// less than `delay` seconds ago waits at the head of the queue, and so does everything behind it.
export class FifoFrontier implements Frontier {
  private readonly queue: Array<{ url: string; host: string }> = [];
  private head = 0;
  private lastStart = 0;
  private readonly allowed = new Map<string, number>();
  private readonly polite: boolean;
  private readonly delay: number;
  constructor(polite: boolean, delay: number) {
    this.polite = polite;
    this.delay = delay;
  }
  add(url: string, host: string): void {
    this.queue.push({ url, host });
  }
  next(now: number): Next | null {
    const item = this.queue[this.head];
    if (!item) return null;
    this.head += 1;
    let start = Math.max(now, this.lastStart); // handed out in order
    if (this.polite) start = Math.max(start, this.allowed.get(item.host) ?? 0);
    this.lastStart = start;
    return { ...item, start };
  }
  fetched(host: string, end: number): void {
    this.allowed.set(host, end + this.delay);
  }
  earliest(): number | null {
    return this.size() > 0 ? 0 : null; // one queue: the head is taken in turn, however long it waits
  }
  size(): number {
    return this.queue.length - this.head;
  }
}

// A queue for each host, and a heap of hosts ordered by the earliest time each may be fetched
// again. A free fetcher takes the host that is ready first, so a slow or busy host delays only
// its own URLs. Mercator's "back queues" work the same way.
export class HostQueueFrontier implements Frontier {
  private readonly queues = new Map<string, string[]>();
  private readonly ready = new MinHeap<{ at: number; host: string }>((a, b) => a.at < b.at);
  private readonly waiting = new Set<string>(); // hosts in the heap or being fetched
  private readonly allowed = new Map<string, number>();
  private readonly delay: number;
  private count = 0;
  constructor(delay: number) {
    this.delay = delay;
  }
  add(url: string, host: string): void {
    let q = this.queues.get(host);
    if (!q) this.queues.set(host, (q = []));
    q.push(url);
    this.count += 1;
    if (!this.waiting.has(host)) {
      this.waiting.add(host);
      this.ready.push({ at: this.allowed.get(host) ?? 0, host });
    }
  }
  next(now: number): Next | null {
    const top = this.ready.pop();
    if (!top) return null;
    const url = (this.queues.get(top.host) as string[]).shift() as string;
    this.count -= 1;
    return { url, host: top.host, start: Math.max(now, top.at) };
  }
  fetched(host: string, end: number): void {
    const at = end + this.delay;
    this.allowed.set(host, at);
    if ((this.queues.get(host) as string[]).length > 0) this.ready.push({ at, host });
    else this.waiting.delete(host);
  }
  earliest(): number | null {
    return this.ready.peek()?.at ?? null;
  }
  size(): number {
    return this.count;
  }
}
