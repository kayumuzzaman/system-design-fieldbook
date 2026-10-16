// One interface for a single photo and for a folder of things.
export interface LibraryItem {
  readonly name: string;
  photoCount(): number;
  bytes(): number;
}

export class PhotoItem implements LibraryItem {
  readonly name: string;
  private readonly size: number;

  constructor(name: string, size: number) {
    this.name = name;
    this.size = size;
  }
  photoCount(): number {
    return 1;
  }
  bytes(): number {
    return this.size;
  }
}

export class Folder implements LibraryItem {
  readonly name: string;
  private readonly children: LibraryItem[] = [];

  constructor(name: string) {
    this.name = name;
  }

  add(item: LibraryItem): this {
    if (item === this || (item instanceof Folder && item.contains(this))) throw new Error("a folder cannot contain itself");
    this.children.push(item);
    return this;
  }
  contains(item: LibraryItem): boolean {
    return this.children.some((child) => child === item || (child instanceof Folder && child.contains(item)));
  }

  // A folder answers by asking each child the same question. It does not care what kind each child is.
  photoCount(): number {
    return this.children.reduce((sum, child) => sum + child.photoCount(), 0);
  }
  bytes(): number {
    return this.children.reduce((sum, child) => sum + child.bytes(), 0);
  }
}
