// Adaptive bitrate: a player picks a rung of the ladder for every segment, on generated bandwidth traces.
import { Rng } from './rng.ts';

export type Rung = { readonly kbps: number; readonly height: number };
// Apple's example H.264 ladder from its HLS authoring specification (checked October 2026), in kbit/s.
export const LADDER: readonly Rung[] = [
  { kbps: 145, height: 234 }, { kbps: 365, height: 360 }, { kbps: 730, height: 432 }, { kbps: 1100, height: 432 },
  { kbps: 2000, height: 540 }, { kbps: 3000, height: 720 }, { kbps: 4500, height: 720 }, { kbps: 6000, height: 1080 },
  { kbps: 7800, height: 1080 },
];
export const SEGMENT = 6;        // seconds of video in one segment: Apple's recommended target duration
export const MAX_BUFFER = 60;    // seconds of video the player holds at most
export const LATENCY = 0.08;     // seconds from sending a request to the first byte

// ---------------------------------------------------------------- bandwidth traces
// A trace is the throughput available to one viewer, in kbit/s, for each second of the session.
export type TraceKind = 'fixed line' | 'mobile';
export type Trace = { readonly kind: TraceKind; readonly kbps: readonly number[] };

export function makeTrace(rng: Rng, kind: TraceKind, seconds: number): Trace {
  const mobile = kind === 'mobile';
  // Each viewer has a typical speed: median 8 Mbit/s on a fixed line, 4 on mobile, spread widely.
  const typical = (mobile ? 4000 : 8000) * Math.exp((mobile ? 0.8 : 0.6) * rng.normal());
  const out: number[] = [];
  let level = typical, nextChange = 0, dropUntil = -1;
  for (let t = 0; t < seconds; t++) {
    if (t >= nextChange) {      // the speed moves to a new level every so often
      level = typical * Math.exp((mobile ? 0.6 : 0.25) * rng.normal());
      nextChange = t + rng.exponential(1 / (mobile ? 20 : 60));
    }
    // Sudden drops: a tunnel, a handover, a microwave oven. Down to 5 to 20% for 4 to 20 seconds.
    if (t > dropUntil && rng.next() < 1 / (mobile ? 50 : 300)) dropUntil = t + 4 + rng.below(17);
    const drop = t <= dropUntil ? 0.05 + 0.15 * rng.next() : 1;
    out.push(Math.max(50, level * drop * Math.exp(0.15 * rng.normal())));
  }
  return { kind, kbps: out };
}

// ---------------------------------------------------------------- the player
export type Sample = { readonly kbps: number; readonly seconds: number };
export type View = {
  readonly buffer: number;          // seconds of video downloaded and not yet played
  readonly last: number;            // rung of the previous segment, -1 before the first
  readonly samples: readonly Sample[];
};
export interface Abr {
  readonly name: string;
  choose(view: View): number;       // the rung for the next segment
}

export type SegmentLog = { readonly index: number; readonly rung: number; readonly start: number; readonly end: number };
export type Session = {
  readonly startup: number;         // seconds from pressing play to the first frame
  readonly stalled: number;         // seconds frozen after playback started
  readonly stalls: number;          // how many times it froze
  readonly meanKbps: number;        // average bitrate of the segments played
  readonly switches: number;        // changes of rung between consecutive segments
  readonly segments: readonly SegmentLog[];
  readonly buffer: readonly (readonly [number, number])[];   // (wall time, buffer) at every change of slope
};

// How long it takes to receive `bits` starting at wall time t, given the trace (repeated if too short).
function transfer(trace: readonly number[], t: number, bits: number): number {
  let time = t, left = bits;
  for (;;) {
    const second = Math.floor(time), rate = (trace[second % trace.length] as number) * 1000;
    const room = second + 1 - time;
    if (rate * room >= left) return time + left / rate - t;
    left -= rate * room;
    time = second + 1;
  }
}

// Plays `segments` segments of one video. `sizes` scales each segment's bytes (scenes differ in complexity).
export function play(abr: Abr, trace: Trace, sizes: readonly number[]): Session {
  let t = 0, buffer = 0, playing = false, startup = 0, stalled = 0, stalls = 0, last = -1, switches = 0, kbpsSum = 0;
  const samples: Sample[] = [], segments: SegmentLog[] = [], points: [number, number][] = [[0, 0]];
  const mark = () => points.push([t, buffer]);
  for (let i = 0; i < sizes.length; i++) {
    // A full buffer: wait until one more segment fits.
    if (buffer + SEGMENT > MAX_BUFFER) { const w = buffer + SEGMENT - MAX_BUFFER; buffer -= w; t += w; mark(); }
    const rung = abr.choose({ buffer, last, samples });
    const bits = (LADDER[rung] as Rung).kbps * 1000 * SEGMENT * (sizes[i] as number);
    const d = LATENCY + transfer(trace.kbps, t + LATENCY, bits);
    const start = t;
    if (!playing) t += d;
    else if (buffer >= d) { buffer -= d; t += d; }
    else {                                  // the buffer runs dry before the segment arrives: a stall
      t += buffer; buffer = 0; mark();
      const frozen = start + d - t;
      stalled += frozen; stalls += 1; t += frozen;
    }
    mark();
    buffer += SEGMENT;
    mark();
    samples.push({ kbps: bits / 1000 / d, seconds: d });
    segments.push({ index: i, rung, start, end: t });
    if (last >= 0 && rung !== last) switches += 1;
    last = rung;
    kbpsSum += (LADDER[rung] as Rung).kbps;
    if (!playing) { playing = true; startup = t; }   // the first frame shows once one segment is in
  }
  t += buffer; buffer = 0; mark();
  return { startup, stalled, stalls, meanKbps: kbpsSum / sizes.length, switches, segments, buffer: points };
}

// ---------------------------------------------------------------- four ways to choose
const highestBelow = (kbps: number) => {
  let r = 0;
  for (let i = 0; i < LADDER.length; i++) if ((LADDER[i] as Rung).kbps <= kbps) r = i;
  return r;
};

// One bitrate for everyone, as a plain progressive download would give.
export class Fixed implements Abr {
  readonly name: string;
  private readonly rung: number;
  constructor(rung: number) {
    this.rung = rung;
    this.name = `fixed ${(LADDER[rung] as Rung).kbps.toLocaleString('en-US')} kbit/s`;
  }
  choose(): number {
    return this.rung;
  }
}

// An exponentially weighted moving average whose weight halves every `halfLife` seconds of samples.
class Ewma {
  private readonly alpha: number;
  private estimate = 0;
  private weight = 0;
  constructor(halfLife: number) {
    this.alpha = Math.exp(Math.log(0.5) / halfLife);
  }
  add(seconds: number, value: number): void {
    const a = Math.pow(this.alpha, seconds);
    this.estimate = value * (1 - a) + a * this.estimate;
    this.weight += seconds;
  }
  get(): number {
    return this.estimate / (1 - Math.pow(this.alpha, this.weight));   // corrects the bias toward the start value of 0
  }
}

// Throughput-based: estimate the bandwidth from recent downloads and pick the highest rung that fits.
// The estimator and the default factors are the ones hls.js documents: the smaller of two moving averages
// with half-lives of 3 and 9 seconds; a rung must fit in 95% of the estimate to stay or go down, and in 70%
// to switch up. A larger factor is bolder, a smaller one more careful.
export class ThroughputBased implements Abr {
  readonly name: string;
  private readonly stay: number;
  private readonly up: number;
  constructor(stay = 0.95, up = 0.7) {
    this.stay = stay;
    this.up = up;
    this.name = `throughput-based, ${Math.round(stay * 100)}% of the estimate`;
  }
  estimate(samples: readonly Sample[]): number {
    if (samples.length === 0) return 500;    // kbit/s, hls.js's default before any sample
    const fast = new Ewma(3), slow = new Ewma(9);
    for (const s of samples) { fast.add(s.seconds, s.kbps); slow.add(s.seconds, s.kbps); }
    return Math.min(fast.get(), slow.get());
  }
  choose(view: View): number {
    const estimate = this.estimate(view.samples);
    const fits = highestBelow(this.stay * estimate);
    if (fits <= view.last) return fits;
    return Math.max(view.last, highestBelow(this.up * estimate));
  }
}

// Buffer-based (BBA-0, Huang et al., 2014): the buffer level alone sets the rate. Below the reservoir,
// the lowest rung; above reservoir + cushion, the highest; in between a straight line, with a rule that
// changes rung only when the line crosses the next rung up or down.
export class BufferBased implements Abr {
  readonly name: string;
  private readonly reservoir: number;
  private readonly cushion: number;
  constructor(reservoir = 24, cushion = 30) {
    this.reservoir = reservoir;
    this.cushion = cushion;
    this.name = `buffer-based, reservoir ${reservoir} s`;
  }
  choose(view: View): number {
    const top = LADDER.length - 1, b = view.buffer;
    if (b <= this.reservoir) return 0;
    if (b >= this.reservoir + this.cushion) return top;
    const lo = (LADDER[0] as Rung).kbps, hi = (LADDER[top] as Rung).kbps;
    const f = lo + (hi - lo) * (b - this.reservoir) / this.cushion;
    const prev = Math.max(view.last, 0);
    const up = Math.min(prev + 1, top), down = Math.max(prev - 1, 0);
    if (f >= (LADDER[up] as Rung).kbps) return Math.max(highestBelow(f), prev);
    if (f <= (LADDER[down] as Rung).kbps) {
      for (let i = 0; i <= top; i++) if ((LADDER[i] as Rung).kbps > f) return Math.min(i, prev);
    }
    return prev;
  }
}

// Buffer-based with a fast start, like the later versions in the same paper: while the buffer is still
// filling, follow the throughput estimate; hand over to the buffer map once the map's rate has caught up
// with it, or as soon as the estimate falls.
export class FastStart implements Abr {
  readonly name = 'buffer-based, fast start';
  private readonly throughput = new ThroughputBased();
  private readonly map = new BufferBased();
  private starting = true;
  choose(view: View): number {
    const fromMap = this.map.choose(view);
    if (this.starting) {
      const fromThroughput = this.throughput.choose(view);
      const caughtUp = view.samples.length > 0 && fromMap >= fromThroughput;
      const falling = view.last >= 0 && fromThroughput < view.last;
      if (!caughtUp && !falling) return fromThroughput;
      this.starting = false;
    }
    return fromMap;
  }
}

// ---------------------------------------------------------------- an experiment over many viewers
export type AbrResult = {
  readonly name: string;
  readonly kind: TraceKind | 'all';
  readonly sessions: number;
  readonly rebufferPercent: number;   // frozen time as a share of watching time
  readonly withStall: number;         // share of sessions that froze at least once
  readonly meanKbps: number;
  readonly firstMinuteKbps: number;   // average bitrate of the first 10 segments, the first minute
  readonly switchesPerSession: number;
  readonly medianStartup: number;
};

export function segmentSizes(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => Math.exp(0.25 * rng.normal() - 0.25 * 0.25 / 2));   // mean 1
}

// The viewers of an experiment: half on fixed lines, half on mobile, each with a trace and segment sizes.
export type Viewer = { readonly trace: Trace; readonly sizes: readonly number[] };
export function population(viewers: number, segments: number, seed: number): Viewer[] {
  const rng = new Rng(seed), out: Viewer[] = [];
  for (let v = 0; v < viewers; v++) {
    const trace = makeTrace(rng, v % 2 === 0 ? 'fixed line' : 'mobile', segments * SEGMENT * 3);
    out.push({ trace, sizes: segmentSizes(rng, segments) });
  }
  return out;
}

export function measure(make: () => Abr, people: readonly Viewer[]): AbrResult[] {
  const name = make().name;
  const runs = people.map((p) => ({ kind: p.trace.kind, s: play(make(), p.trace, p.sizes) }));
  const out: AbrResult[] = [];
  for (const kind of ['all', 'fixed line', 'mobile'] as const) {
    const rs = runs.filter((r) => kind === 'all' || r.kind === kind).map((r) => r.s);
    const watched = rs.reduce((a, s) => a + s.segments.length * SEGMENT + s.stalled, 0);
    const startups = rs.map((s) => s.startup).sort((a, b) => a - b);
    out.push({
      name, kind, sessions: rs.length,
      rebufferPercent: 100 * rs.reduce((a, s) => a + s.stalled, 0) / watched,
      withStall: rs.filter((s) => s.stalls > 0).length / rs.length,
      meanKbps: rs.reduce((a, s) => a + s.meanKbps, 0) / rs.length,
      firstMinuteKbps: rs.reduce((a, s) => a + s.segments.slice(0, 10).reduce((b, g) => b + (LADDER[g.rung] as Rung).kbps, 0) / 10, 0) / rs.length,
      switchesPerSession: rs.reduce((a, s) => a + s.switches, 0) / rs.length,
      medianStartup: startups[Math.floor(startups.length / 2)] as number,
    });
  }
  return out;
}

// The experiment the chapter reports: 400 viewers, 10 minutes of video each.
export const ABR_EXPERIMENT = { viewers: 400, segments: 100, seed: 85 };
export const PLAYERS: readonly (() => Abr)[] = [
  () => new Fixed(5),
  () => new ThroughputBased(0.6, 0.45), () => new ThroughputBased(0.8, 0.6), () => new ThroughputBased(),
  () => new ThroughputBased(1.2, 0.9),
  () => new BufferBased(12, 42), () => new BufferBased(), () => new BufferBased(36, 18),
  () => new FastStart(),
];
