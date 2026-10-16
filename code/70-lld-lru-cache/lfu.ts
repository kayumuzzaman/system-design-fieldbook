import type { Cache } from "./cache.ts";

// Least frequently used, in constant time. Entries are grouped by how many times they have been used.
// Within a group, a Map keeps them in order of last use, so ties are broken by evicting the least recent.
export class LfuCache<K, V> implements Cache<K, V> {
  readonly capacity: number;
  private readonly entries = new Map<K, { value: V; uses: number }>();
  private readonly groups = new Map<number, Map<K, true>>(); // uses -> keys with that many uses, oldest first
  private fewestUses = 0; // the smallest number of uses that any entry has

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a whole number of at least 1");
    this.capacity = capacity;
  }
  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.promote(key, entry);
    return entry.value;
  }

  put(key: K, value: V): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      this.promote(key, existing);
      return;
    }
    if (this.entries.size === this.capacity) {
      const group = this.groups.get(this.fewestUses) as Map<K, true>;
      const victim = group.keys().next().value as K; // least used, and among those, least recently used
      group.delete(victim);
      this.entries.delete(victim);
    }
    this.entries.set(key, { value, uses: 1 });
    this.groupFor(1).set(key, true);
    this.fewestUses = 1; // a new entry always has the fewest uses
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    const group = this.groups.get(entry.uses) as Map<K, true>;
    group.delete(key);
    if (group.size === 0) this.groups.delete(entry.uses);
    return this.entries.delete(key); // the cache is no longer full, and the next new entry resets fewestUses
  }

  // Moves an entry from its group to the next one up.
  private promote(key: K, entry: { value: V; uses: number }): void {
    const group = this.groups.get(entry.uses) as Map<K, true>;
    group.delete(key);
    if (group.size === 0) {
      this.groups.delete(entry.uses);
      if (this.fewestUses === entry.uses) this.fewestUses += 1; // the entry itself is about to be in the next group
    }
    entry.uses += 1;
    this.groupFor(entry.uses).set(key, true);
  }
  private groupFor(uses: number): Map<K, true> {
    let group = this.groups.get(uses);
    if (!group) this.groups.set(uses, (group = new Map()));
    return group;
  }

  // For tests and for drawing: each group, fewest uses first, with its keys oldest first.
  snapshot(): { uses: number; keys: K[] }[] {
    return [...this.groups].sort((a, b) => a[0] - b[0]).map(([uses, keys]) => ({ uses, keys: [...keys.keys()] }));
  }
}
