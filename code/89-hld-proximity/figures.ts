// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { bounds, encode } from "./geo.ts";
import { coverBox, GeohashIndex, QuadTree } from "./index.ts";
import { CITY, makePlaces, seeded } from "./city.ts";

// fig-geohash: the first five halvings for a point at latitude 40, longitude 10
const steps = [];
{
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
  for (let i = 0; i < 5; i += 1) {
    if (i % 2 === 0) { const mid = (lonLo + lonHi) / 2; const bit = 10 >= mid ? 1 : 0; steps.push({ axis: "longitude", mid, bit, box: [latLo, latHi, lonLo, lonHi] }); if (bit) lonLo = mid; else lonHi = mid; }
    else { const mid = (latLo + latHi) / 2; const bit = 40 >= mid ? 1 : 0; steps.push({ axis: "latitude", mid, bit, box: [latLo, latHi, lonLo, lonHi] }); if (bit) latLo = mid; else latHi = mid; }
  }
}
const prefixes = [1, 2, 3, 5, 7].map((n) => ({ n, hash: encode(40, 10, n), ...bounds(encode(40, 10, n)) }));

// fig-cells: a search of 2 km from a busy spot, three ways
const places = makePlaces(200_000);
const gi = new GeohashIndex(places);
const qt = new QuadTree(places, CITY, 100);
let best = places[0] as { id: number; lat: number; lon: number }, most = -1;
for (let i = 0; i < 2000; i += 1) { const p = places[i * 97] as typeof best; const n = gi.within(p.lat, p.lon, 2000).ids.length; if (n > most) { most = n; best = p; } }
const radius = 2000, half = 8000 / 111_195, halfLon = half / Math.cos((best.lat * Math.PI) / 180);
const win = { latLo: best.lat - half, latHi: best.lat + half, lonLo: best.lon - halfLon, lonHi: best.lon + halfLon };
const inWin = (lat: number, lon: number) => lat >= win.latLo && lat <= win.latHi && lon >= win.lonLo && lon <= win.lonHi;
const r = seeded(4);
const dots = places.filter((p) => inWin(p.lat, p.lon) && r() < 0.12).map((p) => [p.lat, p.lon]);
const nine = gi.within(best.lat, best.lon, radius), cover = gi.covering(best.lat, best.lon, radius), quad = qt.within(best.lat, best.lon, radius);
const cells = {
  query: [best.lat, best.lon], radius, window: win, dots,
  nine: gi.cellsFor(best.lat, best.lon, radius), cover: coverBox(best.lat, best.lon, radius, 6).map((h) => ({ hash: h, ...bounds(h) })),
  leaves: qt.leaves().filter((l) => l.latHi > win.latLo && l.latLo < win.latHi && l.lonHi > win.lonLo && l.lonLo < win.lonHi),
  found: nine.ids.length, counts: { nine: nine.candidates, cover: cover.candidates, coverCells: cover.cells, quad: quad.candidates, quadNodes: quad.nodes },
};

// fig-cost: means over 100 searches from random places
const rr = seeded(3);
const cost = [250, 500, 1000, 2000, 5000].map((rad) => {
  let found = 0, n9 = 0, nc = 0, cl = 0, nq = 0;
  for (let i = 0; i < 100; i += 1) {
    const q = places[Math.floor(rr() * places.length)] as typeof best;
    const a = gi.within(q.lat, q.lon, rad), c = gi.covering(q.lat, q.lon, rad), b = qt.within(q.lat, q.lon, rad);
    found += a.ids.length; n9 += a.candidates; nc += c.candidates; cl += c.cells; nq += b.candidates;
  }
  return { radius: rad, found: Math.round(found / 100), nine: Math.round(n9 / 100), cover: Math.round(nc / 100), coverCells: Math.round(cl / 100), quad: Math.round(nq / 100) };
});
console.log(JSON.stringify({ steps, prefixes, cells, cost }));
