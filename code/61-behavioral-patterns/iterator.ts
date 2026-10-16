// A collection that can be walked without showing how it is stored.
export class Shelf implements Iterable<string> {
  private readonly byYear = new Map<number, string[]>();

  add(year: number, photo: string): void {
    const list = this.byYear.get(year) ?? [];
    list.push(photo);
    this.byYear.set(year, list);
  }

  // A generator function: each yield hands over one item and pauses until the next is asked for.
  *[Symbol.iterator](): Iterator<string> {
    for (const year of [...this.byYear.keys()].sort()) yield* this.byYear.get(year) ?? [];
  }
}

export interface Page {
  photos: string[];
  next: string | null; // the cursor for the following page, or null on the last one
}
export type FetchPage = (cursor: string | null) => Promise<Page>;

// The same idea over a network: pages are fetched only as the consumer reaches them.
export async function* allPhotos(fetchPage: FetchPage): AsyncGenerator<string> {
  let cursor: string | null = null;
  do {
    const page: Page = await fetchPage(cursor);
    yield* page.photos;
    cursor = page.next;
  } while (cursor !== null);
}
