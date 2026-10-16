// The least-recently-used cache of chapter 70 (lld-lru-cache), in its Map form: a Map remembers the order in which
// keys were added, so deleting a key and adding it again moves it to the end, and the first key is the oldest.
export class LruCache<K, V> {
  readonly capacity: number;
  private readonly entries = new Map<K, V>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a whole number of at least 1");
    this.capacity = capacity;
  }
  get size(): number {
    return this.entries.size;
  }
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }
  put(key: K, value: V): void {
    if (this.entries.has(key)) this.entries.delete(key);
    else if (this.entries.size === this.capacity) this.entries.delete(this.entries.keys().next().value as K);
    this.entries.set(key, value);
  }
  delete(key: K): boolean {
    return this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
  }
}
