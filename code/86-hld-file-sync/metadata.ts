import type { BlockStore } from "./blocks.ts";

// One version of one file: the list of block hashes is the file's content.
export type Version = {
  readonly path: string;
  readonly rev: number; // its position in the namespace's journal
  readonly blocks: readonly string[];
  readonly size: number;
  readonly device: string;
  readonly time: number; // the device's clock when it was saved
};
export type CommitRequest = {
  readonly path: string;
  readonly parentRev: number | null; // the version this edit started from; null for a new file
  readonly blocks: readonly string[];
  readonly size: number;
  readonly device: string;
  readonly time: number;
};
export type CommitResult =
  | { readonly kind: "committed"; readonly version: Version }
  | { readonly kind: "need-blocks"; readonly missing: string[] }
  | { readonly kind: "conflict"; readonly current: Version | null };
export type Page = { readonly versions: Version[]; readonly cursor: number; readonly hasMore: boolean };
export type Policy = "revision" | "last-write-wins";

// The metadata of one namespace (a user's files, or one shared folder): the current version of
// every path, and a journal of every committed version in order.
export class Namespace {
  private readonly current = new Map<string, Version>();
  private readonly journal: Version[] = [];
  private readonly blocks: BlockStore;
  private readonly policy: Policy;
  constructor(blocks: BlockStore, policy: Policy = "revision") {
    this.blocks = blocks;
    this.policy = policy;
  }

  commit(req: CommitRequest): CommitResult {
    // A version may only refer to blocks that are already stored.
    const missing = this.blocks.missing(req.blocks);
    if (missing.length > 0) return { kind: "need-blocks", missing };
    const cur = this.current.get(req.path) ?? null;
    if (this.policy === "revision") {
      // Compare and set: the edit must start from the version that is current now.
      if ((cur?.rev ?? null) !== req.parentRev) return { kind: "conflict", current: cur };
    } else if (cur !== null && req.time <= cur.time) {
      return { kind: "committed", version: cur }; // last write wins: the older save is dropped
    }
    // In a real store, these lines are one transaction: the version, the journal entry, the references.
    const version: Version = { ...req, rev: this.journal.length + 1 };
    this.journal.push(version);
    this.current.set(req.path, version);
    this.blocks.addRefs(version.blocks);
    return { kind: "committed", version };
  }

  // Everything committed after `cursor`, a page at a time. A client stores the returned cursor
  // and asks again from there, so it never misses or repeats a change.
  changes(cursor: number, limit = 100): Page {
    const versions = this.journal.slice(cursor, cursor + limit);
    const next = cursor + versions.length;
    return { versions, cursor: next, hasMore: next < this.journal.length };
  }

  get(path: string): Version | undefined {
    return this.current.get(path);
  }
  paths(): string[] {
    return [...this.current.keys()].sort();
  }
  head(): number {
    return this.journal.length;
  }
}
