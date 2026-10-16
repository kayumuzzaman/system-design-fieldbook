// Two ways for a replica to resolve writes that arrive without seeing each other.

// A version vector: for each writer, how many writes it has made to this key. Here a writer is a client;
// Dynamo counted per coordinating node instead, which keeps vectors short.
export type VersionVector = Readonly<Record<string, number>>;

export function descends(a: VersionVector, b: VersionVector): boolean {
  return Object.entries(b).every(([node, n]) => (a[node] ?? 0) >= n);
}
export function mergeVectors(a: VersionVector, b: VersionVector): VersionVector {
  const out: Record<string, number> = { ...a };
  for (const [node, n] of Object.entries(b)) out[node] = Math.max(out[node] ?? 0, n);
  return out;
}

// Keeps every write that no other write has replaced. A read returns all of them, siblings, and the
// caller merges: for a shopping cart, the union of the items.
export class SiblingRegister {
  private siblings: { vv: VersionVector; items: ReadonlySet<string> }[] = [];

  read(): { items: Set<string>; context: VersionVector } {
    const items = new Set<string>();
    let context: VersionVector = {};
    for (const s of this.siblings) {
      for (const i of s.items) items.add(i);
      context = mergeVectors(context, s.vv);
    }
    return { items, context };
  }
  // A write carries the context it read. It replaces exactly the siblings that context had seen.
  write(writer: string, context: VersionVector, items: ReadonlySet<string>): void {
    const vv = { ...context, [writer]: (context[writer] ?? 0) + 1 };
    this.siblings = this.siblings.filter((s) => !descends(vv, s.vv));
    this.siblings.push({ vv, items });
  }
  get count(): number {
    return this.siblings.length;
  }
}

// Keeps the write with the latest timestamp, as read from the writer's clock.
export class LastWriteWins {
  private value: { at: number; items: ReadonlySet<string> } = { at: -Infinity, items: new Set() };

  read(): { items: Set<string> } {
    return { items: new Set(this.value.items) };
  }
  write(at: number, items: ReadonlySet<string>): void {
    if (at > this.value.at) this.value = { at, items };
  }
}
