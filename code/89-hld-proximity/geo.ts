// Distances on the Earth, and geohash: a cell name made by halving longitude and latitude in turn.
const R = 6_371_000; // mean Earth radius in meters
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// Each character holds 5 bits; bits alternate between longitude (first) and latitude.
export function encode(lat: number, lon: number, precision: number): string {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  let out = "", bits = 0, value = 0, even = true;
  while (out.length < precision) {
    if (even) {
      const mid = (lonLo + lonHi) / 2;
      if (lon >= mid) { value = value * 2 + 1; lonLo = mid; } else { value *= 2; lonHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { value = value * 2 + 1; latLo = mid; } else { value *= 2; latHi = mid; }
    }
    even = !even;
    if (++bits === 5) { out += BASE32[value]; bits = 0; value = 0; }
  }
  return out;
}

export type Box = { readonly latLo: number; readonly latHi: number; readonly lonLo: number; readonly lonHi: number };
export function bounds(hash: string): Box {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180, even = true;
  for (const ch of hash) {
    const v = BASE32.indexOf(ch);
    for (let b = 4; b >= 0; b -= 1) {
      const bit = (v >> b) & 1;
      if (even) { const mid = (lonLo + lonHi) / 2; if (bit) lonLo = mid; else lonHi = mid; }
      else { const mid = (latLo + latHi) / 2; if (bit) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { latLo, latHi, lonLo, lonHi };
}

// The cell and its eight neighbors: the centers of the cells around this one, encoded again.
export function withNeighbors(hash: string): string[] {
  const b = bounds(hash);
  const dLat = b.latHi - b.latLo, dLon = b.lonHi - b.lonLo;
  const cLat = (b.latLo + b.latHi) / 2, cLon = (b.lonLo + b.lonHi) / 2;
  const out: string[] = [];
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
    const lat = cLat + i * dLat;
    if (lat > 90 || lat < -90) continue;
    const lon = ((cLon + j * dLon + 540) % 360) - 180; // wraps around the date line
    out.push(encode(lat, lon, hash.length));
  }
  return [...new Set(out)];
}

// Width and height in meters of a cell of this length at this latitude.
export function cellSize(precision: number, lat: number): { width: number; height: number } {
  const lonBits = Math.ceil((5 * precision) / 2), latBits = Math.floor((5 * precision) / 2);
  const height = (180 / 2 ** latBits) * (Math.PI * R / 180);
  const width = (360 / 2 ** lonBits) * (Math.PI * R / 180) * Math.cos(rad(lat));
  return { width, height };
}

// The longest geohash whose cells are at least `radius` wide and high: then a circle around any
// point inside a cell stays within that cell and its eight neighbors.
export function precisionFor(radius: number, lat: number): number {
  let p = 1;
  while (p < 12) {
    const c = cellSize(p + 1, lat);
    if (c.width < radius || c.height < radius) break;
    p += 1;
  }
  return p;
}
