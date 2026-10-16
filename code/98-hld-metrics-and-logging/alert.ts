// Alert rules over a noisy series: a plain threshold, a threshold that must hold for a while ("for"),
// and one that also keeps firing for a while after the condition clears ("keep firing for").
export interface Rule { readonly threshold: number; readonly forMs: number; readonly keepMs: number }
export interface Outcome { readonly notifications: number; readonly fired: number[] }

export function evaluate(points: readonly [number, number][], rule: Rule): Outcome {
  let pendingSince = -1, firing = false, lastTrue = -Infinity;
  const fired: number[] = [];
  for (const [t, v] of points) {
    const on = v > rule.threshold;
    if (on) {
      lastTrue = t;
      if (pendingSince < 0) pendingSince = t;
      if (!firing && t - pendingSince >= rule.forMs) { firing = true; fired.push(t); }
    } else {
      if (!firing) pendingSince = -1;
      else if (t - lastTrue >= rule.keepMs) { firing = false; pendingSince = -1; }
    }
  }
  return { notifications: fired.length, fired };
}

// The average over a trailing window: a condition on it ignores short spikes but not a sustained problem.
export function averaged(points: readonly [number, number][], windowMs: number): [number, number][] {
  const out: [number, number][] = [];
  let sum = 0, from = 0;
  points.forEach(([t, v], i) => {
    sum += v;
    while ((points[from] as [number, number])[0] <= t - windowMs) { sum -= (points[from] as [number, number])[1]; from += 1; }
    out.push([t, sum / (i - from + 1)]);
  });
  return out;
}

// A day of a service's 99th-percentile latency every 15 s: about 120 ms, short spikes from time to time,
// and one real incident from 14:00 to 14:20 at about 450 ms, during which a few samples dip below 300.
export const INCIDENT = { start: 14 * 3600_000, end: 14 * 3600_000 + 20 * 60_000 };
export function latencyDay(random: () => number): [number, number][] {
  const out: [number, number][] = [];
  let spike = 0;
  for (let t = 0; t < 24 * 3600_000; t += 15_000) {
    let v = 120 * Math.exp(0.15 * Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random()));
    if (spike === 0 && random() < 0.004) spike = 1 + Math.floor(random() * 4);   // a garbage-collection pause, a slow neighbor...
    if (spike > 0) { v = 320 + random() * 280; spike -= 1; }
    if (t >= INCIDENT.start && t < INCIDENT.end) v = random() < 0.1 ? 260 + random() * 30 : 400 + random() * 100;
    out.push([t, Math.round(v)]);
  }
  return out;
}
