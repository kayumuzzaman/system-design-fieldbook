// Before: one interface for everything that holds photos.
export interface PhotoStore {
  save(id: string, bytes: Uint8Array): Promise<void>;
  load(id: string): Promise<Uint8Array | null>;
}

export class MemoryStore implements PhotoStore {
  private readonly files = new Map<string, Uint8Array>();
  async save(id: string, bytes: Uint8Array): Promise<void> {
    this.files.set(id, bytes);
  }
  async load(id: string): Promise<Uint8Array | null> {
    return this.files.get(id) ?? null;
  }
}

// A snapshot of last night's photos. It has the right shape, and it breaks the promise that save works.
export class SnapshotStore implements PhotoStore {
  private readonly source: PhotoStore;
  constructor(source: PhotoStore) {
    this.source = source;
  }
  async save(): Promise<void> {
    throw new Error("a snapshot cannot be changed");
  }
  load(id: string): Promise<Uint8Array | null> {
    return this.source.load(id);
  }
}

// Written for "any PhotoStore". It compiles with a snapshot as the destination, and fails when run.
export async function copyAll(from: PhotoStore, to: PhotoStore, ids: string[]): Promise<number> {
  let copied = 0;
  for (const id of ids) {
    const bytes = await from.load(id);
    if (bytes) {
      await to.save(id, bytes);
      copied += 1;
    }
  }
  return copied;
}

// After: two smaller promises. A type now claims only what it can keep.
export interface PhotoReader {
  load(id: string): Promise<Uint8Array | null>;
}
export interface PhotoWriter {
  save(id: string, bytes: Uint8Array): Promise<void>;
}

export class Snapshot implements PhotoReader {
  private readonly source: PhotoReader;
  constructor(source: PhotoReader) {
    this.source = source;
  }
  load(id: string): Promise<Uint8Array | null> {
    return this.source.load(id);
  }
}

export async function copyAllSafely(from: PhotoReader, to: PhotoWriter, ids: string[]): Promise<number> {
  let copied = 0;
  for (const id of ids) {
    const bytes = await from.load(id);
    if (bytes) {
      await to.save(id, bytes);
      copied += 1;
    }
  }
  return copied;
}
