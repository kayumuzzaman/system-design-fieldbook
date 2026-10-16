// The metadata of one bucket: for each key, its versions, newest last. The bytes live elsewhere, in volumes;
// a version only records where. Deleting with versioning on adds a delete marker and removes nothing.

export interface Version {
  readonly versionId: string;
  readonly deleteMarker: boolean;
  readonly location: string | null; // where the bytes are: volume and offset; null for a delete marker
  readonly size: number;
  readonly at: number; // when it was written, in days
  noncurrentSince: number | null; // when a newer version replaced it
}

export type Read = { status: 200; version: Version } | { status: 404; deleteMarker: boolean };

export class Bucket {
  readonly versioning: boolean;
  private readonly keys = new Map<string, Version[]>();
  private counter = 0;

  constructor(versioning: boolean) {
    this.versioning = versioning;
  }

  // Returns the versions that no longer exist, whose bytes the garbage collector may reclaim.
  put(key: string, location: string, size: number, now: number): { version: Version; garbage: Version[] } {
    return this.add(key, { versionId: `v${++this.counter}`, deleteMarker: false, location, size, at: now, noncurrentSince: null }, now);
  }

  get(key: string, versionId?: string): Read {
    const versions = this.keys.get(key) ?? [];
    const v = versionId ? versions.find((x) => x.versionId === versionId) : versions.at(-1);
    if (!v) return { status: 404, deleteMarker: false };
    if (v.deleteMarker) return { status: 404, deleteMarker: true };
    return { status: 200, version: v };
  }

  // Without a version id: with versioning, a delete marker becomes the current version; without, the key goes.
  // With a version id: that version is removed for good.
  delete(key: string, now: number, versionId?: string): { garbage: Version[] } {
    const versions = this.keys.get(key) ?? [];
    if (versionId) {
      const i = versions.findIndex((x) => x.versionId === versionId);
      if (i < 0) return { garbage: [] };
      const [gone] = versions.splice(i, 1);
      if (versions.length === 0) this.keys.delete(key);
      return { garbage: gone && !gone.deleteMarker ? [gone] : [] };
    }
    if (!this.versioning) {
      this.keys.delete(key);
      return { garbage: versions.filter((v) => !v.deleteMarker) };
    }
    return { garbage: this.add(key, { versionId: `v${++this.counter}`, deleteMarker: true, location: null, size: 0, at: now, noncurrentSince: null }, now).garbage };
  }

  // Keys in order, starting after `after`, whose current version is not a delete marker: one page of a listing.
  list(prefix: string, after: string, limit: number): string[] {
    return [...this.keys.keys()]
      .filter((k) => k.startsWith(prefix) && k > after && !this.keys.get(k)!.at(-1)!.deleteMarker)
      .sort()
      .slice(0, limit);
  }

  versionsOf(key: string): readonly Version[] {
    return this.keys.get(key) ?? [];
  }

  // A lifecycle rule: remove versions that have been noncurrent for more than `days`, and delete markers
  // with nothing left behind them.
  expireNoncurrent(now: number, days: number): Version[] {
    const garbage: Version[] = [];
    for (const [key, versions] of this.keys) {
      const keep = versions.filter((v, i) => i === versions.length - 1 || v.noncurrentSince === null || now - v.noncurrentSince <= days);
      for (const v of versions) if (!keep.includes(v) && !v.deleteMarker) garbage.push(v);
      if (keep.length === 1 && keep[0]!.deleteMarker) this.keys.delete(key);
      else this.keys.set(key, keep);
    }
    return garbage;
  }

  private add(key: string, v: Version, now: number): { version: Version; garbage: Version[] } {
    const versions = this.keys.get(key) ?? [];
    let garbage: Version[] = [];
    if (this.versioning) {
      const current = versions.at(-1);
      if (current) current.noncurrentSince = now;
      versions.push(v);
    } else {
      garbage = versions.filter((x) => !x.deleteMarker); // overwritten: the old bytes are garbage
      versions.splice(0, versions.length, v);
    }
    this.keys.set(key, versions);
    return { version: v, garbage };
  }
}
