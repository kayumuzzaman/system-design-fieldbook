// What to do with an item that arrives when the queue is full.
export type Overflow = "block" | "drop-newest" | "drop-oldest";

// A queue that never holds more than `capacity` items. Used by the logger's buffered sink and by queued subscribers.
export class BoundedQueue<T> {
  readonly capacity: number;
  readonly overflow: Overflow;
  private readonly items: T[] = [];
  private readonly blocked: { item: T; resolve: () => void }[] = []; // producers waiting for room
  dropped = 0;

  constructor(capacity: number, overflow: Overflow) {
    if (!(capacity >= 1)) throw new RangeError("capacity must be at least 1");
    this.capacity = capacity;
    this.overflow = overflow;
  }

  // Returns nothing when the item was dealt with at once, or, under "block", a promise that
  // resolves when a full queue has taken the item.
  put(item: T): Promise<void> | undefined {
    if (this.items.length < this.capacity) return void this.items.push(item);
    switch (this.overflow) {
      case "drop-newest":
        this.dropped += 1;
        return;
      case "drop-oldest":
        this.items.shift();
        this.items.push(item);
        this.dropped += 1;
        return;
      case "block":
        return new Promise((resolve) => this.blocked.push({ item, resolve }));
    }
  }

  poll(): { item: T } | undefined {
    if (this.items.length === 0) return undefined;
    const item = this.items.shift() as T;
    const next = this.blocked.shift(); // room was made: let one waiting producer in
    if (next !== undefined) {
      this.items.push(next.item);
      next.resolve();
    }
    return { item };
  }

  // Empties the queue and releases every waiting producer, so that nobody waits forever on a closed queue.
  clear(): number {
    const discarded = this.items.length + this.blocked.length;
    this.items.length = 0;
    for (const { resolve } of this.blocked.splice(0)) resolve();
    return discarded;
  }

  get size(): number {
    return this.items.length;
  }
}

// A bounded queue with one consumer working through it later, one item at a time, in order.
// An item that fails is reported and the worker goes on: one bad item must not stop the ones behind it.
export class Worker<T> {
  private readonly queue: BoundedQueue<T>;
  private readonly consume: (item: T) => void | Promise<void>;
  private readonly onError: (error: unknown) => void;
  private busy = false;
  private closed = false;
  private readonly idle: (() => void)[] = [];

  constructor(capacity: number, overflow: Overflow, consume: (item: T) => void | Promise<void>, onError: (error: unknown) => void) {
    this.queue = new BoundedQueue(capacity, overflow);
    this.consume = consume;
    this.onError = onError;
  }

  put(item: T): Promise<void> | undefined {
    if (this.closed) return undefined;
    const accepted = this.queue.put(item);
    if (!this.busy) void this.drain();
    return accepted;
  }

  private async drain(): Promise<void> {
    this.busy = true;
    await null; // never consume inside put: the producer carries on first
    for (let next = this.queue.poll(); next !== undefined && !this.closed; next = this.queue.poll()) {
      try {
        await this.consume(next.item);
      } catch (error) {
        this.onError(error);
      }
    }
    this.busy = false;
    for (const resolve of this.idle.splice(0)) resolve();
  }

  // Resolves when everything accepted so far has been consumed.
  flush(): Promise<void> {
    return this.busy ? new Promise((resolve) => this.idle.push(resolve)) : Promise.resolve();
  }
  // Stops the worker. Items still waiting are discarded, and blocked producers are released.
  close(): number {
    this.closed = true;
    return this.queue.clear();
  }
  get size(): number {
    return this.queue.size;
  }
  get dropped(): number {
    return this.queue.dropped;
  }
}
