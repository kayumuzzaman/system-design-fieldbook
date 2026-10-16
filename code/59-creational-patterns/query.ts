export type PhotoQuery = Readonly<{
  owner: string;
  from: Date | null;
  to: Date | null;
  tags: readonly string[];
  newestFirst: boolean;
  limit: number;
}>;

function checked(query: PhotoQuery): PhotoQuery {
  if (query.from && query.to && query.from > query.to) throw new Error("the start date is after the end date");
  if (query.limit < 1 || query.limit > 200) throw new Error("the limit must be between 1 and 200");
  return Object.freeze({ ...query, tags: Object.freeze([...query.tags]) });
}

// The builder: collects choices one call at a time, and checks them together at the end.
export class PhotoQueryBuilder {
  private readonly owner: string;
  private from: Date | null = null;
  private to: Date | null = null;
  private readonly tags: string[] = [];
  private newest = true;
  private max = 50;

  constructor(owner: string) {
    this.owner = owner; // the one thing every query must have
  }
  takenBetween(from: Date, to: Date): this {
    this.from = from;
    this.to = to;
    return this;
  }
  tagged(tag: string): this {
    this.tags.push(tag);
    return this;
  }
  oldestFirst(): this {
    this.newest = false;
    return this;
  }
  limit(max: number): this {
    this.max = max;
    return this;
  }
  build(): PhotoQuery {
    return checked({ owner: this.owner, from: this.from, to: this.to, tags: this.tags, newestFirst: this.newest, limit: this.max });
  }
}

// The lighter alternative in TypeScript: one object of named options, with defaults.
export function photoQuery(options: { owner: string; from?: Date; to?: Date; tags?: string[]; newestFirst?: boolean; limit?: number }): PhotoQuery {
  return checked({
    owner: options.owner,
    from: options.from ?? null,
    to: options.to ?? null,
    tags: options.tags ?? [],
    newestFirst: options.newestFirst ?? true,
    limit: options.limit ?? 50,
  });
}
