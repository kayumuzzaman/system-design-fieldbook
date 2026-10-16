// Seeded series of the kinds a monitoring system stores, scraped every 15 seconds.
// The mix of kinds is an assumption; the chapter reports each kind separately as well.
export type Kind = "constant" | "counter" | "bucket" | "gauge-int" | "gauge-float";
export const mix: Record<Kind, number> = { bucket: 0.4, counter: 0.25, constant: 0.1, "gauge-int": 0.15, "gauge-float": 0.1 };

function poisson(random: () => number, mean: number): number {
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())));
  let k = 0, p = Math.exp(-mean), s = p;
  const u = random();
  while (u > s) { k += 1; p *= mean / k; s += p; }
  return k;
}

// `jitterMs`: how far a scrape's timestamp may land from the 15-second grid, for one scrape in five.
export function series(random: () => number, kind: Kind, n: number, jitterMs: number, start = 1_760_000_000_000): [number, number][] {
  const out: [number, number][] = [];
  const rate = kind === "counter" ? 10 + random() * 990 : 3 * random();
  let v = kind === "constant" ? 1 : kind === "gauge-int" ? 4096 * Math.floor(100_000 + random() * 50_000) : kind === "gauge-float" ? random() : Math.floor(random() * 1e6);
  for (let i = 0; i < n; i += 1) {
    const t = start + i * 15_000 + (jitterMs > 0 && random() < 0.2 ? Math.round((random() * 2 - 1) * jitterMs) : 0);
    if (kind === "counter" || kind === "bucket") v += poisson(random, rate);
    else if (kind === "gauge-int") v += 4096 * Math.round((random() * 2 - 1) * 50);
    else if (kind === "gauge-float") v = Math.min(1, Math.max(0, v + (random() - 0.5) * 0.05));
    out.push([t, v]);
  }
  return out;
}
