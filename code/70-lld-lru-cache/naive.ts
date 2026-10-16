import type { Cache } from "./cache.ts";

// Slow, obviously correct versions, used only to check the fast ones and to show what "not constant time" costs.
interface Row<K, V> { key: K; value: V; lastUsed: number; uses: number; added: number }

abstract class Scanning<K, V> implements Cache<K, V> {
  readonly capacity: number;
  protected rows: Row<K, V>[] = [];
  private clock = 0;
  constructor(capacity: number) { this.capacity = capacity; }
  get size(): number { return this.rows.length; }
  protected abstract worse(a: Row<K, V>, b: Row<K, V>): boolean; // is a a better victim than b?
  protected touchOnRead = true;

  get(key: K): V | undefined {
    const row = this.rows.find((r) => r.key === key); // looks at every row
    if (!row) return undefined;
    if (this.touchOnRead) { row.lastUsed = this.clock += 1; row.uses += 1; }
    return row.value;
  }
  put(key: K, value: V): void {
    const row = this.rows.find((r) => r.key === key);
    if (row) { row.value = value; if (this.touchOnRead) { row.lastUsed = this.clock += 1; row.uses += 1; } return; }
    if (this.rows.length === this.capacity) {
      const victim = this.rows.reduce((worst, r) => (this.worse(r, worst) ? r : worst));
      this.rows.splice(this.rows.indexOf(victim), 1);
    }
    const now = (this.clock += 1);
    this.rows.push({ key, value, lastUsed: now, uses: 1, added: now });
  }
  delete(key: K): boolean {
    const at = this.rows.findIndex((r) => r.key === key);
    if (at >= 0) this.rows.splice(at, 1);
    return at >= 0;
  }
}
export class NaiveLru<K, V> extends Scanning<K, V> {
  protected worse(a: Row<K, V>, b: Row<K, V>): boolean { return a.lastUsed < b.lastUsed; }
}
export class NaiveLfu<K, V> extends Scanning<K, V> {
  protected worse(a: Row<K, V>, b: Row<K, V>): boolean { return a.uses < b.uses || (a.uses === b.uses && a.lastUsed < b.lastUsed); }
}

// First in, first out: evicts the oldest arrival, however often it has been used. Constant time, and the baseline to beat.
export class FifoCache<K, V> implements Cache<K, V> {
  readonly capacity: number;
  private readonly entries = new Map<K, V>();
  constructor(capacity: number) { this.capacity = capacity; }
  get size(): number { return this.entries.size; }
  get(key: K): V | undefined { return this.entries.get(key); }
  put(key: K, value: V): void {
    if (!this.entries.has(key) && this.entries.size === this.capacity) this.entries.delete(this.entries.keys().next().value as K);
    this.entries.set(key, value);
  }
  delete(key: K): boolean { return this.entries.delete(key); }
}
