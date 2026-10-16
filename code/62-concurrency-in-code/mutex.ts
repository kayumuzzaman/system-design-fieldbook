// A lock for asynchronous code: the functions given to run() execute one at a time, in order of arrival.
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined); // a failure must not block the callers behind it
    return result;
  }
}

// One lock for each key, so that work on different keys does not wait.
export class KeyedMutex {
  private readonly locks = new Map<string, { mutex: Mutex; waiting: number }>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const entry = this.locks.get(key) ?? { mutex: new Mutex(), waiting: 0 };
    this.locks.set(key, entry);
    entry.waiting += 1;
    try {
      return await entry.mutex.run(fn);
    } finally {
      entry.waiting -= 1;
      if (entry.waiting === 0) this.locks.delete(key); // do not keep a lock for every key ever seen
    }
  }
  get size(): number {
    return this.locks.size;
  }
}

// Takes two locks in a fixed order, whatever order the caller named them in.
export function withBoth<T>(a: [string, Mutex], b: [string, Mutex], fn: () => Promise<T>): Promise<T> {
  const [first, second] = a[0] < b[0] ? [a[1], b[1]] : [b[1], a[1]];
  return first.run(() => second.run(fn));
}
