import { sha256 } from "./chunking.ts";

// Content-addressed block storage: a block's key is the hash of its bytes, so the same bytes
// are stored once however many files, versions or users contain them.
export class BlockStore {
  private readonly blocks = new Map<string, Uint8Array>();
  private readonly refs = new Map<string, number>();
  bytesReceived = 0;

  // Which of these hashes have never been uploaded?
  missing(hashes: readonly string[]): string[] {
    return [...new Set(hashes)].filter((h) => !this.blocks.has(h));
  }
  put(hash: string, bytes: Uint8Array): void {
    if (sha256(bytes) !== hash) throw new Error(`block ${hash.slice(0, 8)} does not match its hash`);
    this.bytesReceived += bytes.length;
    if (!this.blocks.has(hash)) this.blocks.set(hash, bytes.slice());
  }
  get(hash: string): Uint8Array {
    const b = this.blocks.get(hash);
    if (!b) throw new Error(`no block ${hash.slice(0, 8)}`);
    return b;
  }
  // Every version that lists a block holds one reference to it.
  addRefs(hashes: readonly string[]): void {
    for (const h of hashes) this.refs.set(h, (this.refs.get(h) ?? 0) + 1);
  }
  releaseRefs(hashes: readonly string[]): void {
    for (const h of hashes) this.refs.set(h, (this.refs.get(h) ?? 0) - 1);
  }
  // Deletes blocks that no version refers to. Run later, never inside a commit.
  collect(): number {
    let freed = 0;
    for (const [h, b] of this.blocks) {
      if ((this.refs.get(h) ?? 0) <= 0) {
        this.blocks.delete(h);
        this.refs.delete(h);
        freed += b.length;
      }
    }
    return freed;
  }
  storedBytes(): number {
    let n = 0;
    for (const b of this.blocks.values()) n += b.length;
    return n;
  }
  count(): number {
    return this.blocks.size;
  }
}
