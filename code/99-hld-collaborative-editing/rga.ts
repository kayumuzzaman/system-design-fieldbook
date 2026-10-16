// A sequence CRDT in the style of RGA (replicated growable array). Every character gets an id that never
// changes: a counter and the replica that made it. An insert names the id it goes after, not a position,
// so it means the same thing on every replica. A delete only marks its character as gone (a tombstone).
export interface Id { readonly n: number; readonly site: string }
export type Change =
  | { readonly kind: "ins"; readonly id: Id; readonly after: Id | null; readonly ch: string }
  | { readonly kind: "del"; readonly id: Id };

interface Item { readonly id: Id; readonly after: Id | null; readonly ch: string; deleted: boolean }

const key = (id: Id) => `${id.n}@${id.site}`;
// Which of two inserts after the same character comes first: the later one (higher counter), then the higher site.
const before = (a: Id, b: Id) => a.n > b.n || (a.n === b.n && a.site > b.site);

export class Rga {
  readonly site: string;
  private readonly items: Item[] = [];
  private readonly index = new Map<string, Item>();     // id -> its item
  private clock = 0;
  private shown = 0;                                      // characters not deleted
  private readonly waiting: Change[] = [];

  constructor(site: string) { this.site = site; }

  text(): string { let s = ""; for (const it of this.items) if (!it.deleted) s += it.ch; return s; }
  length(): number { return this.shown; }

  // Local edits, by visible position. They return the change to send to every other replica.
  insert(pos: number, ch: string): Change {
    const after = pos === 0 ? null : this.visible(pos - 1).id;
    const c: Change = { kind: "ins", id: { n: this.clock + 1, site: this.site }, after, ch };
    this.apply(c);
    return c;
  }
  remove(pos: number): Change {
    const c: Change = { kind: "del", id: this.visible(pos).id };
    this.apply(c);
    return c;
  }

  // Changes from elsewhere may arrive in any order; one whose character it refers to is not here yet waits.
  receive(c: Change): void {
    this.waiting.push(c);
    for (let progress = true; progress;) {
      progress = false;
      for (let i = 0; i < this.waiting.length; i += 1) {
        const w = this.waiting[i] as Change;
        if (this.has(w.id) && w.kind === "ins") { this.waiting.splice(i, 1); i -= 1; continue; }   // a repeat
        if (this.ready(w)) { this.waiting.splice(i, 1); i -= 1; this.apply(w); progress = true; }
      }
    }
  }

  private ready(c: Change): boolean { return c.kind === "del" ? this.has(c.id) : c.after === null || this.has(c.after); }
  private has(id: Id): boolean { return this.index.has(key(id)); }

  private apply(c: Change): void {
    if (c.kind === "del") {
      const it = this.index.get(key(c.id)) as Item;
      if (!it.deleted) { it.deleted = true; this.shown -= 1; }
      return;
    }
    if (this.has(c.id)) return;
    this.clock = Math.max(this.clock, c.id.n);
    let i = c.after === null ? 0 : this.items.indexOf(this.index.get(key(c.after)) as Item) + 1;
    // skip what was inserted after the same character by later inserts. Anything inserted inside those
    // has a still larger counter (Lamport clocks), so one comparison skips whole subtrees.
    while (i < this.items.length && before((this.items[i] as Item).id, c.id)) i += 1;
    const item: Item = { id: c.id, after: c.after, ch: c.ch, deleted: false };
    this.items.splice(i, 0, item);
    this.index.set(key(c.id), item);
    this.shown += 1;
  }

  private visible(pos: number): Item {
    let k = -1;
    for (const it of this.items) if (!it.deleted && ++k === pos) return it;
    throw new Error(`no character at ${pos}`);
  }

  // Every item in order, for drawing: its id, its character, what it was inserted after, and whether it is deleted.
  dump(): { id: string; ch: string; after: string | null; deleted: boolean }[] {
    return this.items.map((it) => ({ id: key(it.id), ch: it.ch, after: it.after === null ? null : key(it.after), deleted: it.deleted }));
  }

  // The size of the structure: every character ever inserted, and runs of characters one replica typed in a row.
  stats(): { items: number; tombstones: number; runs: number } {
    let runs = 0, tombstones = 0;
    this.items.forEach((it, k) => {
      if (it.deleted) tombstones += 1;
      const prev = this.items[k - 1];
      const continues = prev !== undefined && prev.id.site === it.id.site && prev.id.n + 1 === it.id.n && it.after !== null && key(it.after) === key(prev.id) && prev.deleted === it.deleted;
      if (!continues) runs += 1;
    });
    return { items: this.items.length, tombstones, runs };
  }
}
