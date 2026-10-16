// What any place that keeps photo files must be able to do. Nothing here says how.
export interface PhotoStore {
  save(id: string, bytes: Uint8Array): Promise<void>;
  load(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
}

export class MemoryStore implements PhotoStore {
  private readonly files = new Map<string, Uint8Array>();

  async save(id: string, bytes: Uint8Array): Promise<void> {
    this.files.set(id, bytes);
  }
  async load(id: string): Promise<Uint8Array | null> {
    return this.files.get(id) ?? null;
  }
  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }
}

// The library is written against the interface. It cannot tell which store it was given.
export class Library {
  private readonly store: PhotoStore;
  private readonly maxBytes: number;

  constructor(store: PhotoStore, maxBytes = 20_000_000) {
    this.store = store;
    this.maxBytes = maxBytes;
  }

  async upload(id: string, bytes: Uint8Array): Promise<void> {
    if (bytes.length === 0) throw new Error("the file is empty");
    if (bytes.length > this.maxBytes) throw new Error("the file is too large");
    await this.store.save(id, bytes);
  }

  async download(id: string): Promise<Uint8Array> {
    const bytes = await this.store.load(id);
    if (bytes === null) throw new Error(`no photo ${id}`);
    return bytes;
  }
}
