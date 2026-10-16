// Web map tiles: at zoom z the world (in the Web Mercator projection) is a square of 2^z by 2^z tiles.
export const EARTH_RADIUS = 6378137;   // meters, as used by Web Mercator

export function tileOf(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, x), y: Math.min(n - 1, y) };
}

// A quadkey names a tile by the path from the top: one digit (0 to 3) per zoom level. A tile's
// four children share its quadkey as a prefix, so nearby tiles sort together.
export function quadkey(x: number, y: number, z: number): string {
  let key = "";
  for (let i = z; i > 0; i -= 1) {
    const mask = 1 << (i - 1);
    key += String((x & mask ? 1 : 0) + (y & mask ? 2 : 0));
  }
  return key;
}

// Meters of ground per pixel, for tiles of the given size in pixels.
export function metersPerPixel(lat: number, z: number, tilePixels = 256): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS) / (tilePixels * 2 ** z);
}

export function tilesAt(z: number): number {
  return 4 ** z;
}
export function tilesUpTo(z: number): number {
  return (4 ** (z + 1) - 1) / 3;
}

// The most tiles a screen can overlap: a partial tile at each edge.
export function tilesOnScreen(widthPx: number, heightPx: number, tilePixels = 256): number {
  return (Math.ceil(widthPx / tilePixels) + 1) * (Math.ceil(heightPx / tilePixels) + 1);
}
