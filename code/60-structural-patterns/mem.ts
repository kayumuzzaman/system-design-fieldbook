// Run with: node --expose-gc mem.ts   Measures the heap used by a million photo records, with and without sharing.
import { cameraFor } from "./flyweight.ts";
declare const gc: () => void;
const models = Array.from({ length: 50 }, (_, i) => [`Maker ${i % 7}`, `Model X${i}`, `${18 + i}-${55 + i}mm f/${(2 + (i % 5) * 0.4).toFixed(1)}`, `${20 + i} megapixel full-frame sensor`] as const);
const measure = (make: (i: number) => object): number => {
  gc(); const before = process.memoryUsage().heapUsed;
  const kept: object[] = new Array(1_000_000);
  for (let i = 0; i < kept.length; i++) kept[i] = make(i);
  gc(); const used = process.memoryUsage().heapUsed - before;
  if (kept.length !== 1_000_000) throw new Error();
  return used;
};
const own = measure((i) => { const m = models[i % 50]!; return { id: i, camera: { make: m[0] + "", model: m[1] + "", lens: m[2] + "", sensor: m[3] + "" } }; });
const shared = measure((i) => { const m = models[i % 50]!; return { id: i, camera: cameraFor(m[0], m[1], m[2], m[3]) }; });
console.log(`own camera object each: ${(own / 1e6).toFixed(0)} MB   shared: ${(shared / 1e6).toFixed(0)} MB   ratio ${(own / shared).toFixed(1)}`);
