// Downsampling: keep, for each interval, what can be combined again later.
export interface Rollup { readonly start: number; readonly min: number; readonly max: number; readonly sum: number; readonly count: number }

export function downsample(points: readonly [number, number][], stepMs: number): Rollup[] {
  const out: Rollup[] = [];
  for (const [t, v] of points) {
    const start = t - (t % stepMs);
    const last = out[out.length - 1];
    if (last && last.start === start) out[out.length - 1] = { start, min: Math.min(last.min, v), max: Math.max(last.max, v), sum: last.sum + v, count: last.count + 1 };
    else out.push({ start, min: v, max: v, sum: v, count: 1 });
  }
  return out;
}

// Rollups combine into coarser rollups exactly: min of mins, max of maxes, sums and counts added.
export function coarsen(rows: readonly Rollup[], stepMs: number): Rollup[] {
  const out: Rollup[] = [];
  for (const r of rows) {
    const start = r.start - (r.start % stepMs);
    const last = out[out.length - 1];
    if (last && last.start === start) out[out.length - 1] = { start, min: Math.min(last.min, r.min), max: Math.max(last.max, r.max), sum: last.sum + r.sum, count: last.count + r.count };
    else out.push({ ...r, start });
  }
  return out;
}

// Latency histograms: counts per bucket, which add across minutes and servers. A percentile does not.
export const bounds = [5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2500, 5000];
export function histogram(values: readonly number[]): number[] {
  const c = new Array<number>(bounds.length + 1).fill(0);
  for (const v of values) { let i = bounds.findIndex((b) => v <= b); if (i < 0) i = bounds.length; c[i] = (c[i] as number) + 1; }
  return c;
}
export function quantileOf(counts: readonly number[], q: number): number {
  const total = counts.reduce((a, b) => a + b, 0), rank = q * total;
  let seen = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const c = counts[i] as number;
    if (c > 0 && seen + c >= rank) {
      if (i === bounds.length) return bounds[i - 1] as number;
      const lo = i === 0 ? 0 : (bounds[i - 1] as number);
      return lo + ((rank - seen) / c) * ((bounds[i] as number) - lo);
    }
    seen += c;
  }
  return NaN;
}
export function exactQuantile(values: readonly number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] as number;
}
