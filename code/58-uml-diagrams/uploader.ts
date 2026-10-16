export type File = { name: string; bytes: Uint8Array };
export type Photo = { id: string; name: string; size: number };

export class Album {
  readonly id: string;
  private readonly photos: Photo[] = [];
  constructor(id: string) {
    this.id = id;
  }
  add(photo: Photo): void {
    this.photos.push(photo);
  }
  get count(): number {
    return this.photos.length;
  }
}

export interface Validator {
  check(file: File): string | null; // a reason for refusing the file, or null
}
export interface Albums {
  find(id: string): Promise<Album>;
  save(album: Album): Promise<void>;
}
export interface PhotoStore {
  save(id: string, bytes: Uint8Array): Promise<void>;
}
export interface Notifier {
  photoAdded(album: Album, photo: Photo): void; // returns at once: sending happens later
}

export class Rejected extends Error {}

export class Uploader {
  private readonly validator: Validator;
  private readonly albums: Albums;
  private readonly store: PhotoStore;
  private readonly notifier: Notifier;
  private readonly newId: () => string;

  constructor(validator: Validator, albums: Albums, store: PhotoStore, notifier: Notifier, newId: () => string) {
    this.validator = validator;
    this.albums = albums;
    this.store = store;
    this.notifier = notifier;
    this.newId = newId;
  }

  async upload(albumId: string, file: File): Promise<Photo> {
    const problem = this.validator.check(file);
    if (problem) throw new Rejected(problem);

    const album = await this.albums.find(albumId);
    const photo: Photo = { id: this.newId(), name: file.name, size: file.bytes.length };
    await this.store.save(photo.id, file.bytes);
    album.add(photo);
    await this.albums.save(album);
    this.notifier.photoAdded(album, photo);
    return photo;
  }
}
