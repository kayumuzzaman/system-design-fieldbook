import assert from "node:assert/strict";
import { bounds, cellSize, distance, encode, precisionFor, withNeighbors } from "./geo.ts";
import { GeohashIndex, QuadTree } from "./index.ts";
import { CITY, makePlaces, seeded } from "./city.ts";

// --- geohash: a known value, and every point lies inside its own cell
assert.equal(encode(57.64911, 10.40744, 11), "u4pruydqqvj");
assert.equal(encode(40, 10, 1), "s");
{
  const r = seeded(1);
  for (let i = 0; i < 1000; i += 1) {
    const lat = r() * 170 - 85, lon = r() * 360 - 180, h = encode(lat, lon, 1 + Math.floor(r() * 9));
    const b = bounds(h);
    assert.ok(b.latLo <= lat && lat <= b.latHi && b.lonLo <= lon && lon <= b.lonHi);
    assert.ok(encode(lat, lon, h.length + 2).startsWith(h)); // a longer hash refines a shorter one
    const ring = withNeighbors(h);
    assert.ok(ring.length === 9 || b.latHi === 90 || b.latLo === -90); // eight neighbors, except next to a pole
  }
  assert.deepEqual(withNeighbors("s").sort(), ["7", "e", "g", "k", "m", "s", "t", "u", "v"]);
}
// --- distances: Palermo to Catania, which the Redis documentation gives as 166,274 m
assert.ok(Math.abs(distance(38.115556, 13.361389, 37.502669, 15.087269) - 166_274) < 200);
console.log("geohash cells at latitude 40, width by height:");
for (let p = 4; p <= 8; p += 1) { const c = cellSize(p, 40); console.log(`  length ${p}: ${(c.width / 1000).toFixed(c.width < 1000 ? 3 : 2)} km by ${(c.height / 1000).toFixed(c.height < 1000 ? 3 : 2)} km`); }
console.log(`  length chosen for a radius of 250 m: ${precisionFor(250, 40)}; 1 km: ${precisionFor(1000, 40)}; 5 km: ${precisionFor(5000, 40)}`);

// --- 200,000 places in a city: three indexes, checked against a full scan
const places = makePlaces(200_000);
const gi = new GeohashIndex(places);
const qt = new QuadTree(places, CITY, 100);
{
  const leaves = qt.leaves();
  const km2 = (l: { latLo: number; latHi: number; lonLo: number; lonHi: number }) => (l.latHi - l.latLo) * 111.195 * (l.lonHi - l.lonLo) * 111.195 * Math.cos((40 * Math.PI) / 180);
  const areas = leaves.map(km2).sort((a, b) => a - b);
  console.log(`quadtree with at most 100 places a leaf: ${leaves.length.toLocaleString("en-US")} leaves, from ${areas[0]!.toFixed(3)} km² in the densest area to ${areas[areas.length - 1]!.toFixed(1)} km² in the sparsest`);
}
const r = seeded(3);
console.log("places within a radius, 100 searches from random places (means): found / examined with 9 cells / with a covering of smaller cells (range lookups) / with the quadtree; a full scan examines 200,000");
for (const radius of [250, 500, 1000, 2000, 5000]) {
  let found = 0, nine = 0, cover = 0, lookups = 0, quad = 0;
  for (let i = 0; i < 100; i += 1) {
    const q = places[Math.floor(r() * places.length)] as { lat: number; lon: number };
    const a = gi.within(q.lat, q.lon, radius), c = gi.covering(q.lat, q.lon, radius), b = qt.within(q.lat, q.lon, radius);
    assert.deepEqual([...c.ids].sort((x, y) => x - y), [...a.ids].sort((x, y) => x - y));
    assert.deepEqual([...b.ids].sort((x, y) => x - y), [...a.ids].sort((x, y) => x - y));
    if (i < 3) assert.equal(places.filter((p) => distance(q.lat, q.lon, p.lat, p.lon) <= radius).length, a.ids.length);
    found += a.ids.length; nine += a.candidates; cover += c.candidates; lookups += c.cells; quad += b.candidates;
  }
  console.log(`  ${String(radius).padStart(5)} m: ${Math.round(found / 100).toLocaleString("en-US")} found / ${Math.round(nine / 100).toLocaleString("en-US")} / ${Math.round(cover / 100).toLocaleString("en-US")} (${Math.round(lookups / 100)}) / ${Math.round(quad / 100).toLocaleString("en-US")}`);
}
console.log("all chapter 89 tests passed");
