export interface Image {
  readonly id: string;
  pixels(): Promise<Uint8Array>;
}

// A proxy that puts off loading until somebody asks, and loads only once.
export class LazyImage implements Image {
  readonly id: string;
  private readonly load: (id: string) => Promise<Uint8Array>;
  private loaded: Promise<Uint8Array> | undefined;

  constructor(id: string, load: (id: string) => Promise<Uint8Array>) {
    this.id = id;
    this.load = load;
  }

  pixels(): Promise<Uint8Array> {
    this.loaded ??= this.load(this.id);
    return this.loaded;
  }
}

export interface PhotoReader {
  load(id: string): Promise<Uint8Array | null>;
}

// A proxy that decides whether the call may go through at all.
export class GuardedReader implements PhotoReader {
  private readonly inner: PhotoReader;
  private readonly user: string;
  private readonly maySee: (user: string, id: string) => boolean;

  constructor(inner: PhotoReader, user: string, maySee: (user: string, id: string) => boolean) {
    this.inner = inner;
    this.user = user;
    this.maySee = maySee;
  }

  async load(id: string): Promise<Uint8Array | null> {
    if (!this.maySee(this.user, id)) return null; // the same answer as "no such photo"
    return this.inner.load(id);
  }
}
