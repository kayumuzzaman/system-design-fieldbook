import { LruCache } from "./lru.ts";

export interface Link {
  code: string;
  longUrl: string;
  expiresAt: number | null; // milliseconds, or null for never
  disabled: boolean; // deleted by the owner, or taken down as abuse
}
export interface LinkStore {
  get(code: string): Promise<Link | undefined>;
}
export interface Click {
  code: string;
  at: number;
  referrer: string | null;
}
export interface Reply {
  status: number;
  headers: Record<string, string>;
}

// Clicks wait in memory and leave in batches. Sending is never awaited by a redirect.
// If the analytics side is down, clicks pile up to a bound and the oldest are dropped:
// analytics may lose a few clicks, but a redirect may not wait for them.
export class ClickBuffer {
  dropped = 0;
  private pending: Click[] = [];
  private readonly send: (batch: Click[]) => Promise<void>;
  private readonly maxPending: number;

  constructor(send: (batch: Click[]) => Promise<void>, maxPending = 100_000) {
    this.send = send;
    this.maxPending = maxPending;
  }

  add(click: Click): void {
    this.pending.push(click);
    if (this.pending.length > this.maxPending) {
      this.pending.shift();
      this.dropped++;
    }
  }

  // Called on a timer, about once a second.
  async flush(): Promise<number> {
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0) return 0;
    try {
      await this.send(batch);
      return batch.length;
    } catch {
      this.pending = batch.concat(this.pending); // try again at the next flush
      return 0;
    }
  }

  get waiting(): number {
    return this.pending.length;
  }
}

interface Cached {
  link: Link | null; // null: the code does not exist
  until: number;
}

// The redirect path: an in-process cache in front of the store, an answer at once,
// and the click handed to the buffer.
export class Redirector {
  private readonly store: LinkStore;
  private readonly clicks: ClickBuffer;
  private readonly cache: LruCache<string, Cached>;
  private readonly cacheMs: number;
  private readonly missMs: number;

  constructor(store: LinkStore, clicks: ClickBuffer, entries: number, cacheMs = 60_000, missMs = 5_000) {
    this.store = store;
    this.clicks = clicks;
    this.cache = new LruCache(entries);
    this.cacheMs = cacheMs;
    this.missMs = missMs;
  }

  async redirect(code: string, now: number, referrer: string | null = null): Promise<Reply> {
    let entry = this.cache.get(code);
    if (!entry || entry.until <= now) {
      const link = (await this.store.get(code)) ?? null;
      entry = { link, until: now + (link ? this.cacheMs : this.missMs) };
      this.cache.put(code, entry);
    }
    const link = entry.link;
    if (!link) return { status: 404, headers: { "Cache-Control": "no-store" } };
    if (link.disabled || (link.expiresAt !== null && link.expiresAt <= now)) {
      return { status: 410, headers: { "Cache-Control": "no-store" } };
    }
    this.clicks.add({ code, at: now, referrer });
    // Browsers may reuse the answer for a minute, never past the link's expiry. Shared caches may not store it.
    const left = link.expiresAt === null ? 60 : Math.floor((link.expiresAt - now) / 1000);
    return { status: 301, headers: { Location: link.longUrl, "Cache-Control": `private, max-age=${Math.min(60, left)}` } };
  }

  // Called when a link is deleted or taken down, from an event every server subscribes to.
  forget(code: string): void {
    this.cache.delete(code);
  }
}
