import { Worker, type Overflow } from "./queue.ts";

export type Handler<T> = (message: T) => void | Promise<void>;

// "sync": the handler runs inside publish. "queued": the subscriber has its own bounded queue and
// takes messages from it one at a time, in order, after publish has returned.
export type Delivery = { readonly mode: "sync" } | { readonly mode: "queued"; readonly capacity: number; readonly overflow: Overflow };

interface Subscription<T> {
  deliver(message: T): void | Promise<void>;
  close(): void;
}

// An in-process publish-subscribe bus. Topics maps each topic name to the type of its messages.
export class Bus<Topics extends Record<string, unknown>> {
  private readonly topics = new Map<keyof Topics, Set<Subscription<unknown>>>();
  private readonly onError: (error: unknown, topic: keyof Topics) => void;

  constructor(onError: (error: unknown, topic: keyof Topics) => void) {
    this.onError = onError;
  }

  // Returns the function that unsubscribes. Calling it twice is harmless.
  subscribe<K extends keyof Topics>(topic: K, handler: Handler<Topics[K]>, delivery: Delivery = { mode: "sync" }): () => void {
    let subscription: Subscription<Topics[K]>;
    if (delivery.mode === "sync") subscription = { deliver: handler, close: () => {} };
    else {
      const worker = new Worker(delivery.capacity, delivery.overflow, handler, (error) => this.onError(error, topic));
      subscription = { deliver: (message) => worker.put(message), close: () => void worker.close() };
    }
    const set = this.topics.get(topic) ?? new Set();
    this.topics.set(topic, set);
    set.add(subscription);
    return () => {
      if (set.delete(subscription)) subscription.close();
    };
  }

  // Every subscriber is offered the message, whatever the others do. The promise, when there is one,
  // resolves once every subscriber has taken it: handled it, or queued it, or (under "block") made room for it.
  publish<K extends keyof Topics>(topic: K, message: Topics[K]): Promise<void> | undefined {
    const waits: Promise<void>[] = [];
    for (const subscription of [...(this.topics.get(topic) ?? [])]) { // a copy: handlers may unsubscribe
      try {
        const done = subscription.deliver(message);
        if (done) waits.push(done.catch((error) => this.onError(error, topic)));
      } catch (error) {
        this.onError(error, topic);
      }
    }
    return waits.length > 0 ? Promise.all(waits).then(() => undefined) : undefined;
  }

  subscribers(topic: keyof Topics): number {
    return this.topics.get(topic)?.size ?? 0;
  }
}
