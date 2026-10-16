import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PhotoStore } from "./store.ts";

export class DiskStore implements PhotoStore {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async save(id: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, id), bytes);
  }
  async load(id: string): Promise<Uint8Array | null> {
    try {
      return await readFile(join(this.directory, id));
    } catch {
      return null;
    }
  }
  async delete(id: string): Promise<void> {
    await rm(join(this.directory, id), { force: true });
  }
}
