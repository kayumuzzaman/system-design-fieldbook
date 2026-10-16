import { bounds, distance, encode, precisionFor, withNeighbors } from "./geo.ts";

export type Place = { readonly id: number; readonly lat: number; readonly lon: number };
export type Found = { readonly ids: number[]; readonly candidates: number };

// Places sorted by a long geohash. All places in a cell share its prefix, so each cell is one
// contiguous range, found by binary search: the same lookup a B-tree or a sorted set does.
export class GeohashIndex {
  private readonly keys: string[] = [];
  private readonly places: Place[] = [];
  constructor(places: readonly Place[], precision = 9) {
    const rows = places.map((p) => ({ key: encode(p.lat, p.lon, precision), p }));
    rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const r of rows) { this.keys.push(r.key); this.places.push(r.p); }
  }
  private lower(prefix: string): number {
    let lo = 0, hi = this.keys.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if ((this.keys[m] as string) < prefix) lo = m + 1; else hi = m; }
    return lo;
  }
  // Nine cells at least as large as the radius: few lookups, many places to discard.
  within(lat: number, lon: number, radius: number): Found & { cells: number } {
    return this.scan(lat, lon, radius, withNeighbors(encode(lat, lon, precisionFor(radius, lat))));
  }
  // Every cell one size smaller that touches the circle's bounding box: more lookups, fewer places.
  covering(lat: number, lon: number, radius: number): Found & { cells: number } {
    return this.scan(lat, lon, radius, coverBox(lat, lon, radius, precisionFor(radius, lat) + 1));
  }
  private scan(lat: number, lon: number, radius: number, cells: string[]): Found & { cells: number } {
    const ids: number[] = [];
    let candidates = 0;
    for (const cell of cells) {
      for (let i = this.lower(cell); i < this.keys.length && (this.keys[i] as string).startsWith(cell); i += 1) {
        const p = this.places[i] as Place;
        candidates += 1;
        if (distance(lat, lon, p.lat, p.lon) <= radius) ids.push(p.id);
      }
    }
    return { ids, candidates, cells: cells.length };
  }
  cellsFor(lat: number, lon: number, radius: number) {
    return withNeighbors(encode(lat, lon, precisionFor(radius, lat))).map((h) => ({ hash: h, ...bounds(h) }));
  }
}

// The cells of one length that overlap the square around a circle.
export function coverBox(lat: number, lon: number, radius: number, precision: number): string[] {
  const dLat = radius / 111_195, dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const first = bounds(encode(lat - dLat, lon - dLon, precision));
  const stepLat = first.latHi - first.latLo, stepLon = first.lonHi - first.lonLo;
  const out = new Set<string>();
  for (let la = (first.latLo + first.latHi) / 2; la - stepLat / 2 <= lat + dLat; la += stepLat)
    for (let lo = (first.lonLo + first.lonHi) / 2; lo - stepLon / 2 <= lon + dLon; lo += stepLon) out.add(encode(la, lo, precision));
  return [...out];
}

// A quadtree: a square splits into four when it holds more than `capacity` places, so cells are
// small where places are dense and large where they are sparse.
type QNode = { latLo: number; latHi: number; lonLo: number; lonHi: number; points: Place[] | null; kids: QNode[] | null };
export class QuadTree {
  private readonly root: QNode;
  private readonly capacity: number;
  constructor(places: readonly Place[], box: { latLo: number; latHi: number; lonLo: number; lonHi: number }, capacity = 100) {
    this.capacity = capacity;
    this.root = { ...box, points: [], kids: null };
    for (const p of places) this.insert(this.root, p, 0);
  }
  private insert(n: QNode, p: Place, depth: number): void {
    if (n.kids) { this.insert(this.child(n, p), p, depth + 1); return; }
    (n.points as Place[]).push(p);
    if ((n.points as Place[]).length > this.capacity && depth < 24) {
      const midLat = (n.latLo + n.latHi) / 2, midLon = (n.lonLo + n.lonHi) / 2;
      n.kids = [
        { latLo: midLat, latHi: n.latHi, lonLo: n.lonLo, lonHi: midLon, points: [], kids: null },
        { latLo: midLat, latHi: n.latHi, lonLo: midLon, lonHi: n.lonHi, points: [], kids: null },
        { latLo: n.latLo, latHi: midLat, lonLo: n.lonLo, lonHi: midLon, points: [], kids: null },
        { latLo: n.latLo, latHi: midLat, lonLo: midLon, lonHi: n.lonHi, points: [], kids: null },
      ];
      const pts = n.points as Place[];
      n.points = null;
      for (const q of pts) this.insert(this.child(n, q), q, depth + 1);
    }
  }
  private child(n: QNode, p: Place): QNode {
    const kids = n.kids as QNode[];
    const north = p.lat >= (n.latLo + n.latHi) / 2, east = p.lon >= (n.lonLo + n.lonHi) / 2;
    return kids[(north ? 0 : 2) + (east ? 1 : 0)] as QNode;
  }
  within(lat: number, lon: number, radius: number): Found & { nodes: number } {
    const dLat = radius / 111_195, dLon = dLat / Math.cos((lat * Math.PI) / 180);
    const ids: number[] = [];
    let candidates = 0, nodes = 0;
    const visit = (n: QNode) => {
      if (n.latHi < lat - dLat || n.latLo > lat + dLat || n.lonHi < lon - dLon || n.lonLo > lon + dLon) return;
      nodes += 1;
      if (n.kids) { for (const k of n.kids) visit(k); return; }
      for (const p of n.points as Place[]) {
        candidates += 1;
        if (distance(lat, lon, p.lat, p.lon) <= radius) ids.push(p.id);
      }
    };
    visit(this.root);
    return { ids, candidates, nodes };
  }
  leaves(): Array<{ latLo: number; latHi: number; lonLo: number; lonHi: number; count: number }> {
    const out: Array<{ latLo: number; latHi: number; lonLo: number; lonHi: number; count: number }> = [];
    const walk = (n: QNode) => {
      if (n.kids) n.kids.forEach(walk);
      else out.push({ latLo: n.latLo, latHi: n.latHi, lonLo: n.lonLo, lonHi: n.lonHi, count: (n.points as Place[]).length });
    };
    walk(this.root);
    return out;
  }
}
