// Delivery: segment requests from many viewers, answered by edge caches, a shield, or the origin.
import { SEGMENT } from './abr.ts';
import { Rng } from './rng.ts';

export type CdnConfig = {
  readonly videos: number;           // the catalog, ranked by popularity
  readonly zipf: number;             // the video of rank r is chosen in proportion to 1 / r^zipf
  readonly views: number;
  readonly edges: number;            // viewers are spread evenly over this many edge locations
  readonly meanWatch: number;        // segments a viewer watches on average before leaving
  readonly renditions: readonly { readonly kbps: number; readonly share: number }[];
  readonly warmup: number;           // share of the views played before anything is counted
  readonly forecastError: number;    // spread of the popularity forecast used to fill caches in advance
  readonly seed: number;
};
export const CDN: CdnConfig = {
  videos: 5_000, zipf: 0.9, views: 100_000, edges: 4, meanWatch: 30,
  renditions: [{ kbps: 6000, share: 0.35 }, { kbps: 3000, share: 0.4 }, { kbps: 1100, share: 0.25 }],
  warmup: 0.3, forecastError: 1, seed: 85,
};

// A cache that evicts the least recently used segment when the bytes it holds would exceed its capacity:
// a hash map to find a segment and a doubly linked list for the order of use, as in the LRU chapter.
type Node = { key: number; bytes: number; newer: Node; older: Node };
export class LruBytes {
  private readonly nodes = new Map<number, Node>();
  private readonly newest = {} as Node;
  private readonly oldest = {} as Node;
  private used = 0;
  private readonly capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
    this.newest.older = this.oldest;
    this.oldest.newer = this.newest;
  }
  // True if the segment was held. A miss stores it, evicting the least recently used until it fits.
  get(key: number, bytes: number): boolean {
    const node = this.nodes.get(key);
    if (node) {
      this.unlink(node);
      this.linkAsNewest(node);
      return true;
    }
    if (bytes > this.capacity) return false;
    while (this.used + bytes > this.capacity) {
      const victim = this.oldest.newer;
      this.unlink(victim);
      this.nodes.delete(victim.key);
      this.used -= victim.bytes;
    }
    const added = { key, bytes } as Node;
    this.nodes.set(key, added);
    this.linkAsNewest(added);
    this.used += bytes;
    return false;
  }
  private unlink(node: Node): void {
    node.newer.older = node.older;
    node.older.newer = node.newer;
  }
  private linkAsNewest(node: Node): void {
    node.older = this.newest.older;
    node.newer = this.newest;
    this.newest.older.newer = node;
    this.newest.older = node;
  }
}

type Catalog = { readonly lengths: Int32Array; readonly cdf: Float64Array; readonly weights: Float64Array; readonly bytes: number };
const key = (video: number, segment: number, rendition: number) => (video * 4096 + segment) * 4 + rendition;
const segmentBytes = (kbps: number) => kbps * 1000 / 8 * SEGMENT;

function catalog(c: CdnConfig, rng: Rng): Catalog {
  const lengths = new Int32Array(c.videos), weights = new Float64Array(c.videos), cdf = new Float64Array(c.videos);
  let total = 0, bytes = 0;
  const perSecondOfAll = c.renditions.reduce((a, r) => a + segmentBytes(r.kbps), 0);
  for (let v = 0; v < c.videos; v++) {
    // Lengths: median 6 minutes, from 1 minute to an hour.
    lengths[v] = Math.max(10, Math.min(600, Math.round(60 * Math.exp(0.8 * rng.normal()))));
    weights[v] = Math.pow(v + 1, -c.zipf);
    total += weights[v] as number;
    cdf[v] = total;
    bytes += (lengths[v] as number) * perSecondOfAll;
  }
  for (let v = 0; v < c.videos; v++) { weights[v] = (weights[v] as number) / total; cdf[v] = (cdf[v] as number) / total; }
  return { lengths, cdf, weights, bytes };
}

function pick(cdf: Float64Array, x: number): number {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if ((cdf[mid] as number) < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// One request per segment watched, in the order viewers send them (view after view), kept in typed arrays.
type Requests = { readonly keys: Float64Array; readonly rendition: Uint8Array; readonly edge: Uint8Array; readonly n: number; readonly firstCounted: number };
function requests(c: CdnConfig, cat: Catalog, rng: Rng): Requests {
  let size = c.views * c.meanWatch * 2, n = 0, firstCounted = -1;
  let keys = new Float64Array(size), rendition = new Uint8Array(size), edge = new Uint8Array(size);
  const leave = 1 / c.meanWatch;
  for (let i = 0; i < c.views; i++) {
    if (firstCounted < 0 && i >= c.warmup * c.views) firstCounted = n;
    const v = pick(cat.cdf, rng.next());
    let x = rng.next(), r = 0;
    while (r < c.renditions.length - 1 && x >= (c.renditions[r] as { share: number }).share) { x -= (c.renditions[r] as { share: number }).share; r++; }
    const e = rng.below(c.edges);
    for (let s = 0; s < (cat.lengths[v] as number); s++) {
      if (n === size) {
        size *= 2;
        const k2 = new Float64Array(size), r2 = new Uint8Array(size), e2 = new Uint8Array(size);
        k2.set(keys); r2.set(rendition); e2.set(edge); keys = k2; rendition = r2; edge = e2;
      }
      keys[n] = key(v, s, r); rendition[n] = r; edge[n] = e; n++;
      if (rng.next() < leave) break;
    }
  }
  return { keys, rendition, edge, n, firstCounted };
}

// Every segment ranked by a forecast of how often it will be requested: the forecast of the video's
// popularity, which is off by a random factor, times the share of its rendition, times the chance that a
// viewer gets that far into the video. Filling an edge in advance takes segments from the top of this list.
type Ranked = { readonly key: number; readonly score: number; readonly bytes: number };
function forecastRanking(c: CdnConfig, cat: Catalog, rng: Rng): Ranked[] {
  const out: Ranked[] = [];
  for (let v = 0; v < c.videos; v++) {
    const guess = (cat.weights[v] as number) * Math.exp(c.forecastError * rng.normal());
    c.renditions.forEach((rd, r) => {
      let reach = 1;
      for (let s = 0; s < (cat.lengths[v] as number); s++) {
        out.push({ key: key(v, s, r), score: guess * rd.share * reach, bytes: segmentBytes(rd.kbps) });
        reach *= 1 - 1 / c.meanWatch;
      }
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
function fill(ranking: readonly Ranked[], capacity: number): Set<number> {
  const held = new Set<number>();
  let used = 0;
  for (const o of ranking) { if (used + o.bytes > capacity) break; held.add(o.key); used += o.bytes; }
  return held;
}

export type CdnRow = {
  readonly edgePercent: number;      // each edge's capacity, as a share of the catalog's bytes
  readonly edgeHit: number;          // share of bytes served by the edges, caching on demand (LRU)
  readonly withShield: number;       // share served by edges or the shield, which holds 4 times an edge
  readonly forecast: number;         // share served by edges filled in advance from a forecast
};
export type CdnResult = { readonly catalogBytes: number; readonly requests: number; readonly rows: readonly CdnRow[] };

export function simulateCdn(c: CdnConfig, edgePercents: readonly number[]): CdnResult {
  const rng = new Rng(c.seed);
  const cat = catalog(c, rng);
  const reqs = requests(c, cat, rng);
  const ranking = forecastRanking(c, cat, new Rng(c.seed + 1));
  const rows: CdnRow[] = [];
  const sizes = c.renditions.map((r) => segmentBytes(r.kbps));
  for (const pct of edgePercents) {
    const cap = cat.bytes * pct / 100;
    const edges = Array.from({ length: c.edges }, () => new LruBytes(cap)), shield = new LruBytes(4 * cap);
    const filled = fill(ranking, cap);
    let all = 0, edgeHit = 0, shieldHit = 0, forecastHit = 0;
    for (let i = 0; i < reqs.n; i++) {
      const k = reqs.keys[i] as number, bytes = sizes[reqs.rendition[i] as number] as number;
      const atEdge = (edges[reqs.edge[i] as number] as LruBytes).get(k, bytes);
      const atShield = atEdge ? false : shield.get(k, bytes);
      if (i < reqs.firstCounted) continue;
      all += bytes;
      if (atEdge) edgeHit += bytes; else if (atShield) shieldHit += bytes;
      if (filled.has(k)) forecastHit += bytes;
    }
    rows.push({ edgePercent: pct, edgeHit: edgeHit / all, withShield: (edgeHit + shieldHit) / all, forecast: forecastHit / all });
  }
  return { catalogBytes: cat.bytes, requests: reqs.n, rows };
}
