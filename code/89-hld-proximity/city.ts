import type { Place } from "./index.ts";

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// A city about 50 km across at latitude 40: most places in dense neighborhoods, the rest spread out.
export const CITY = { lat: 40, lon: 10, latLo: 39.775, latHi: 40.225, lonLo: 9.706, lonHi: 10.294 };
export function makePlaces(n: number, seed = 89): Place[] {
  const r = seeded(seed);
  const centers = Array.from({ length: 30 }, () => ({
    lat: CITY.latLo + 0.1 + r() * (CITY.latHi - CITY.latLo - 0.2),
    lon: CITY.lonLo + 0.1 + r() * (CITY.lonHi - CITY.lonLo - 0.2),
    spread: 0.004 + r() * 0.02, // about 0.4 to 2.6 km
  }));
  const out: Place[] = [];
  while (out.length < n) {
    let lat: number, lon: number;
    if (r() < 0.6) {
      const c = centers[Math.floor(r() * centers.length)] as { lat: number; lon: number; spread: number };
      lat = c.lat + gauss(r) * c.spread;
      lon = c.lon + (gauss(r) * c.spread) / Math.cos((40 * Math.PI) / 180);
    } else {
      lat = CITY.latLo + r() * (CITY.latHi - CITY.latLo);
      lon = CITY.lonLo + r() * (CITY.lonHi - CITY.lonLo);
    }
    if (lat < CITY.latLo || lat > CITY.latHi || lon < CITY.lonLo || lon > CITY.lonHi) continue;
    out.push({ id: out.length, lat, lon });
  }
  return out;
}
