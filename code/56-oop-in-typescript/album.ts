export type Photo = { readonly id: string; readonly bytes: number };

// Before: every field is open. Any caller can leave the album in a state that makes no sense.
export class OpenAlbum {
  photos: Photo[] = [];
  coverId: string | null = null;
}

// After: the fields are private, and every change goes through a method that keeps the rules.
export class Album {
  private readonly photos = new Map<string, Photo>();
  private coverId: string | null = null;
  readonly limit: number;

  constructor(limit = 1000) {
    this.limit = limit;
  }

  add(photo: Photo): void {
    if (this.photos.size >= this.limit) throw new Error(`an album holds at most ${this.limit} photos`);
    this.photos.set(photo.id, photo);
    this.coverId ??= photo.id; // rule: an album with photos always has a cover
  }

  remove(id: string): void {
    if (!this.photos.delete(id)) return;
    if (this.coverId === id) this.coverId = this.photos.keys().next().value ?? null; // rule: the cover is one of the photos
  }

  setCover(id: string): void {
    if (!this.photos.has(id)) throw new Error("the cover must be a photo in the album");
    this.coverId = id;
  }

  get cover(): Photo | null {
    return this.coverId === null ? null : this.photos.get(this.coverId) ?? null;
  }

  get size(): number {
    return this.photos.size;
  }

  list(): readonly Photo[] {
    return [...this.photos.values()]; // a copy: callers get the photos, not the album's own collection
  }
}
