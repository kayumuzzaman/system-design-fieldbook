import { chunk, type Chunker } from "./chunking.ts";
import type { BlockStore } from "./blocks.ts";
import type { Namespace, Version } from "./metadata.ts";

type LocalFile = { bytes: Uint8Array; baseRev: number | null; dirty: boolean };
export type Server = { readonly meta: Namespace; readonly blocks: BlockStore };

// One device's copy of a namespace, and the client half of the sync protocol.
export class Device {
  readonly name: string;
  private readonly server: Server;
  private readonly chunker: Chunker;
  private readonly clock: () => number;
  private readonly files = new Map<string, LocalFile>();
  private readonly cache = new Map<string, Uint8Array>(); // blocks this device already holds
  private cursor = 0;
  uploaded = 0;
  downloaded = 0;
  conflicts = 0;
  constructor(name: string, server: Server, chunker: Chunker, clock: () => number) {
    this.name = name;
    this.server = server;
    this.chunker = chunker;
    this.clock = clock;
  }

  write(path: string, bytes: Uint8Array): void {
    const f = this.files.get(path);
    this.files.set(path, { bytes, baseRev: f ? f.baseRev : null, dirty: true });
  }
  read(path: string): Uint8Array | undefined {
    return this.files.get(path)?.bytes;
  }
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
  pending(): number {
    return [...this.files.values()].filter((f) => f.dirty).length;
  }

  // Upload every local change. Returns how many versions were committed.
  push(): number {
    let committed = 0;
    for (let pass = 0; pass < 3; pass += 1) { // a second pass uploads any conflicted copies
      const dirty = [...this.files].filter(([, f]) => f.dirty);
      if (dirty.length === 0) break;
      for (const [path, f] of dirty) if (this.pushOne(path, f)) committed += 1;
    }
    return committed;
  }

  private pushOne(path: string, f: LocalFile): boolean {
    const chunks = chunk(f.bytes, this.chunker);
    const req = { path, parentRev: f.baseRev, blocks: chunks.map((c) => c.hash), size: f.bytes.length, device: this.name, time: this.clock() };
    let r = this.server.meta.commit(req);
    if (r.kind === "need-blocks") {
      // Upload only the blocks the server has never seen, then commit again.
      const missing = new Set(r.missing);
      for (const c of chunks) {
        if (!missing.has(c.hash)) continue;
        this.server.blocks.put(c.hash, f.bytes.subarray(c.offset, c.offset + c.length));
        this.uploaded += c.length;
        missing.delete(c.hash);
      }
      r = this.server.meta.commit(req);
    }
    for (const c of chunks) this.cache.set(c.hash, f.bytes.subarray(c.offset, c.offset + c.length));
    if (r.kind === "committed") {
      if (r.version.device === this.name && r.version.time === req.time) {
        this.files.set(path, { bytes: f.bytes, baseRev: r.version.rev, dirty: false });
        return true;
      }
      this.install(r.version); // last write wins dropped this save: take the stored version
      return false;
    }
    if (r.kind === "conflict") {
      // Someone else changed the file first. Keep both: ours under a new name, theirs at the path.
      this.conflicts += 1;
      const dot = path.lastIndexOf(".");
      const copy = `${path.slice(0, dot)} (${this.name}’s conflicted copy)${path.slice(dot)}`;
      this.files.set(this.uniqueName(copy), { bytes: f.bytes, baseRev: null, dirty: true });
      if (r.current) this.install(r.current);
      else this.files.delete(path);
      return false;
    }
    throw new Error(`blocks still missing for ${path}`);
  }

  private uniqueName(path: string): string {
    let name = path;
    for (let i = 2; this.files.has(name) || this.server.meta.get(name); i += 1) name = path.replace(")", ` ${i})`);
    return name;
  }

  // Fetch every change since the stored cursor, a page at a time.
  pull(): number {
    let applied = 0;
    for (;;) {
      const page = this.server.meta.changes(this.cursor);
      for (const v of page.versions) {
        const f = this.files.get(v.path);
        if (f?.dirty) continue; // a local edit is waiting: pushing it will report the conflict
        if (f && f.baseRev !== null && f.baseRev >= v.rev) continue; // already have it
        this.install(v);
        applied += 1;
      }
      this.cursor = page.cursor;
      if (!page.hasMore) return applied;
    }
  }

  // Download the blocks this device lacks, and rebuild the file from its list of blocks.
  private install(v: Version): void {
    const parts = v.blocks.map((h) => {
      let b = this.cache.get(h);
      if (!b) {
        b = this.server.blocks.get(h);
        this.downloaded += b.length;
        this.cache.set(h, b);
      }
      return b;
    });
    const bytes = new Uint8Array(v.size);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.length;
    }
    this.files.set(v.path, { bytes, baseRev: v.rev, dirty: false });
  }
}
