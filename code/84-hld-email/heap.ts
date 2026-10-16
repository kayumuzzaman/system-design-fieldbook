// A binary min-heap: the smallest item is always at the top, and adding or removing costs O(log n).
export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly before: (a: T, b: T) => boolean;

  constructor(before: (a: T, b: T) => boolean) {
    this.before = before;
  }
  get size(): number {
    return this.items.length;
  }
  peek(): T | undefined {
    return this.items[0];
  }
  push(item: T): void {
    const items = this.items;
    let i = items.push(item) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(items[i] as T, items[parent] as T)) break;
      [items[i], items[parent]] = [items[parent] as T, items[i] as T];
      i = parent;
    }
  }
  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      for (let i = 0; ; ) {
        const left = 2 * i + 1, right = left + 1;
        let least = i;
        if (left < items.length && this.before(items[left] as T, items[least] as T)) least = left;
        if (right < items.length && this.before(items[right] as T, items[least] as T)) least = right;
        if (least === i) break;
        [items[i], items[least]] = [items[least] as T, items[i] as T];
        i = least;
      }
    }
    return top;
  }
}
