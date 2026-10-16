import { seeded } from "./random.ts";

// A simulated morning commute: a 36 km route into a city, driven at different times on many days.
// Each segment slows down around its own rush hour; how much varies from day to day; some days
// have a crash. The question is how well each way of predicting the travel time does.
export interface Segment { km: number; freeKmh: number; peak: number; depth: number }
export interface Incident { from: number; to: number; start: number; end: number; kmh: number }
export interface Day { severity: number; incident: Incident | null }

export const ROUTE: Segment[] = Array.from({ length: 36 }, (_, k) => ({
  km: 1,
  freeKmh: k < 4 || k >= 32 ? 50 : 100,         // town streets at both ends, motorway between
  peak: 480 - (k - 18) * 1.5,                   // minutes after midnight: the jam starts near the city
  depth: 0.25 + 0.45 * (k / 35),                // and is worst there
}));
const WIDTH = 35;                               // minutes

// The typical slowdown at minute t: a bell around the segment's own peak.
export function typicalFactor(s: Segment, t: number, severity = 1): number {
  return Math.max(0.1, 1 - s.depth * severity * Math.exp(-(((t - s.peak) / WIDTH) ** 2) / 2));
}
export function actualKmh(k: number, t: number, day: Day): number {
  const s = ROUTE[k] as Segment;
  let v = s.freeKmh * typicalFactor(s, t, day.severity);
  const i = day.incident;
  if (i && k >= i.from && k <= i.to && t >= i.start && t < i.end) v = Math.min(v, i.kmh);
  return v;
}
// Driving the route: a segment at a time, in steps of 100 m, at the speed of the moment.
export function drive(t0: number, speed: (k: number, t: number) => number): number {
  let t = t0;
  ROUTE.forEach((s, k) => {
    for (let step = 0; step < 10; step += 1) t += ((s.km / 10) / speed(k, t)) * 60;
  });
  return t - t0;    // minutes
}

export function makeDays(count: number, seed: number): Day[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => {
    const severity = 0.6 + random() * 0.7;
    let incident: Incident | null = null;
    if (random() < 0.25) {
      const at = 4 + Math.floor(random() * 28), start = 390 + random() * 150;
      incident = { from: Math.max(0, at - 2), to: at, start, end: start + 20 + random() * 40, kmh: 15 };
    }
    return { severity, incident };
  });
}

export type Method = "free flow" | "traffic now" | "typical for the time" | "now, fading to typical";
export const METHODS: Method[] = ["free flow", "traffic now", "typical for the time", "now, fading to typical"];

// What a server knows at departure: speeds reported by phones on each segment right now,
// each with a few percent of measurement noise, and the typical pattern for every time of day.
export function predict(method: Method, t0: number, live: number[], fadeMinutes = 15): number {
  const typical = (k: number, t: number) => (ROUTE[k] as Segment).freeKmh * typicalFactor(ROUTE[k] as Segment, t);
  switch (method) {
    case "free flow": return drive(t0, (k) => (ROUTE[k] as Segment).freeKmh);
    case "traffic now": return drive(t0, (k) => live[k] as number);
    case "typical for the time": return drive(t0, typical);
    case "now, fading to typical": return drive(t0, (k, t) => {
      // today's difference from typical, which fades as the segment lies further in the future
      const ratio = (live[k] as number) / typical(k, t0), w = Math.exp(-(t - t0) / fadeMinutes);
      return typical(k, t) * ratio ** w;
    });
  }
}

export interface Errors { method: Method; meanPct: number; p90Pct: number; incidentMeanPct: number }
export function compareMethods(days: Day[], seed: number, from = 360, to = 600, every = 10): Errors[] {
  const random = seeded(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const errs = new Map<Method, number[]>(METHODS.map((m) => [m, []]));
  const incidentErrs = new Map<Method, number[]>(METHODS.map((m) => [m, []]));
  for (const day of days) {
    for (let t0 = from; t0 <= to; t0 += every) {
      const truth = drive(t0, (k, t) => actualKmh(k, t, day));
      const live = ROUTE.map((_, k) => actualKmh(k, t0, day) * (1 + 0.05 * gauss()));
      const hit = day.incident !== null && day.incident.end > t0 && day.incident.start < t0 + truth;
      for (const m of METHODS) {
        const e = (Math.abs(predict(m, t0, live) - truth) / truth) * 100;
        (errs.get(m) as number[]).push(e);
        if (hit) (incidentErrs.get(m) as number[]).push(e);
      }
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] as number;
  return METHODS.map((m) => ({
    method: m,
    meanPct: round1(mean(errs.get(m) as number[])),
    p90Pct: round1(p90(errs.get(m) as number[])),
    incidentMeanPct: round1(mean(incidentErrs.get(m) as number[])),
  }));
}
const round1 = (x: number) => Math.round(x * 10) / 10;
