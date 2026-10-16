// Five parts of the media subsystem, each with its own interface.
export interface Scanner { isSafe(bytes: Uint8Array): boolean }
export interface MetadataReader { takenAt(bytes: Uint8Array): Date | null }
export interface Thumbnailer { make(bytes: Uint8Array, width: number): Uint8Array }
export interface Files { put(key: string, bytes: Uint8Array): void }
export interface SearchIndex { add(id: string, takenAt: Date | null): void }

// The facade: one call for the thing nearly every caller wants.
export class PhotoIntake {
  private readonly scanner: Scanner;
  private readonly metadata: MetadataReader;
  private readonly thumbnails: Thumbnailer;
  private readonly files: Files;
  private readonly index: SearchIndex;

  constructor(scanner: Scanner, metadata: MetadataReader, thumbnails: Thumbnailer, files: Files, index: SearchIndex) {
    this.scanner = scanner;
    this.metadata = metadata;
    this.thumbnails = thumbnails;
    this.files = files;
    this.index = index;
  }

  accept(id: string, bytes: Uint8Array): void {
    if (!this.scanner.isSafe(bytes)) throw new Error("the file failed the safety scan");
    const takenAt = this.metadata.takenAt(bytes);
    this.files.put(`original/${id}`, bytes);
    this.files.put(`thumb/${id}`, this.thumbnails.make(bytes, 200));
    this.index.add(id, takenAt);
  }
}
