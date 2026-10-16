// A binary min-heap of (key, node) pairs in typed arrays. A node may be pushed again with a smaller
// key; the stale copy is skipped when it is popped ("lazy deletion"), which is simpler than decrease-key.
export class NodeHeap {
  private keys: Float64Array;
  private nodes: Int32Array;
  private count = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.nodes = new Int32Array(capacity);
  }
  get size(): number {
    return this.count;
  }
  clear(): void {
    this.count = 0;
  }
  topKey(): number {
    return this.count > 0 ? (this.keys[0] as number) : Infinity;
  }
  push(key: number, node: number): void {
    if (this.count === this.keys.length) this.grow();
    const keys = this.keys, nodes = this.nodes;
    let i = this.count++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      nodes[i] = nodes[parent] as number;
      i = parent;
    }
    keys[i] = key;
    nodes[i] = node;
  }
  // Removes the smallest pair. Returns the node; its key was topKey() before the call.
  pop(): number {
    const keys = this.keys, nodes = this.nodes;
    const top = nodes[0] as number;
    const n = --this.count;
    const key = keys[n] as number, node = nodes[n] as number;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= n) break;
      if (child + 1 < n && (keys[child + 1] as number) < (keys[child] as number)) child += 1;
      if ((keys[child] as number) >= key) break;
      keys[i] = keys[child] as number;
      nodes[i] = nodes[child] as number;
      i = child;
    }
    keys[i] = key;
    nodes[i] = node;
    return top;
  }
  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2), nodes = new Int32Array(this.nodes.length * 2);
    keys.set(this.keys);
    nodes.set(this.nodes);
    this.keys = keys;
    this.nodes = nodes;
  }
}
