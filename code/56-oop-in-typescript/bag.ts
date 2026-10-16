export class Bag<T> {
  protected readonly items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }
  addAll(items: T[]): void {
    for (const item of items) this.add(item); // a detail of how Bag works: addAll is built on add
  }
  get size(): number {
    return this.items.length;
  }
}

// By inheritance: a bag that also counts every item ever added.
export class CountingBag<T> extends Bag<T> {
  added = 0;

  override add(item: T): void {
    this.added += 1;
    super.add(item);
  }
  override addAll(items: T[]): void {
    this.added += items.length;
    super.addAll(items); // which calls this.add for each item, so each is counted a second time
  }
}

// By composition: an object that has a bag, and forwards to it.
export class CountedBag<T> {
  added = 0;
  private readonly bag = new Bag<T>();

  add(item: T): void {
    this.added += 1;
    this.bag.add(item);
  }
  addAll(items: T[]): void {
    this.added += items.length;
    this.bag.addAll(items); // whatever the bag does inside stays inside
  }
  get size(): number {
    return this.bag.size;
  }
}
