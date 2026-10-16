import type { Cache } from "./cache.ts";

interface Node<K, V> {
  key: K;
  value: V;
  newer: Node<K, V>;
  older: Node<K, V>;
}

// Least recently used, with a hash map for finding an entry and a doubly linked list for the order of use.
// Every operation touches a fixed number of nodes, whatever the size of the cache.
export class LruCache<K, V> implements Cache<K, V> {
  readonly capacity: number;
  private readonly nodes = new Map<K, Node<K, V>>();
  // Two sentinels that are never removed, so that every real node always has a neighbor on each side.
  private readonly newest = {} as Node<K, V>;
  private readonly oldest = {} as Node<K, V>;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a whole number of at least 1");
    this.capacity = capacity;
    this.newest.older = this.oldest;
    this.oldest.newer = this.newest;
  }

  get size(): number {
    return this.nodes.size;
  }

  get(key: K): V | undefined {
    const node = this.nodes.get(key);
    if (!node) return undefined;
    this.unlink(node);
    this.linkAsNewest(node); // reading is a use
    return node.value;
  }

  put(key: K, value: V): void {
    const existing = this.nodes.get(key);
    if (existing) {
      existing.value = value;
      this.unlink(existing);
      this.linkAsNewest(existing);
      return;
    }
    if (this.nodes.size === this.capacity) {
      const victim = this.oldest.newer; // the real node next to the old-end sentinel
      this.unlink(victim);
      this.nodes.delete(victim.key);
    }
    const node = { key, value } as Node<K, V>;
    this.nodes.set(key, node);
    this.linkAsNewest(node);
  }

  delete(key: K): boolean {
    const node = this.nodes.get(key);
    if (!node) return false;
    this.unlink(node);
    return this.nodes.delete(key);
  }

  // Newest first. For tests and for drawing: not part of the contract.
  keys(): K[] {
    const keys: K[] = [];
    for (let node = this.newest.older; node !== this.oldest; node = node.older) keys.push(node.key);
    return keys;
  }

  private unlink(node: Node<K, V>): void {
    node.newer.older = node.older;
    node.older.newer = node.newer;
  }
  private linkAsNewest(node: Node<K, V>): void {
    node.older = this.newest.older;
    node.newer = this.newest;
    this.newest.older.newer = node;
    this.newest.older = node;
  }
}

// The same policy in the way most TypeScript code writes it. A Map remembers the order in which keys were added,
// so deleting a key and adding it again moves it to the end, and the first key is always the least recently used.
export class LruMapCache<K, V> implements Cache<K, V> {
  readonly capacity: number;
  private readonly entries = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }
  get size(): number {
    return this.entries.size;
  }
  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as V;
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
  keys(): K[] {
    return [...this.entries.keys()].reverse();
  }
}
