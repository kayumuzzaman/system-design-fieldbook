// Step 2 of the chapter: traffic, storage, bandwidth and compute from a handful of assumptions.
// The chapter's calculator (stream85) does the same arithmetic.
import { LADDER } from './abr.ts';
import { LADDER_COST } from './transcode.ts';

export type Assumptions = {
  readonly viewers: number;          // people who watch something on a day
  readonly minutes: number;          // minutes each of them watches
  readonly mbps: number;             // average bitrate delivered, Mbit/s
  readonly peak: number;             // busiest hour over the average
  readonly uploads: number;          // videos uploaded a day
  readonly length: number;           // minutes in an average upload
  readonly sourceMbps: number;       // bitrate of what creators upload
  readonly ladderMbps: number;       // all renditions of one second of video together, Mbit/s
  readonly overhead: number;         // stored bytes over logical bytes (erasure coding)
  readonly encodeCost: number;       // core-seconds to encode one second of video into every rung
  readonly hit: number;              // share of delivered bytes served by the CDN, 0 to 1
};

export const TODAY: Assumptions = {
  viewers: 200e6, minutes: 40, mbps: 3, peak: 2,
  uploads: 500e3, length: 6, sourceMbps: 10,
  ladderMbps: Math.round(LADDER.reduce((a, r) => a + r.kbps, 0) / 10) / 100,   // 25.64, the Apple ladder
  overhead: 1.5, encodeCost: Math.round(LADDER_COST * 10) / 10,                // 14.3
  hit: 0.9,
};

export type Estimate = {
  readonly watchHoursPerDay: number;
  readonly concurrentPeak: number;   // viewers watching at the same moment in the busiest hour
  readonly egressPeakBits: number;   // bit/s leaving the CDN at peak
  readonly egressPerDay: number;     // bytes delivered a day
  readonly segmentRequestsPeak: number;
  readonly heartbeatsPeak: number;   // playback events a second at peak, one per stream every 30 seconds
  readonly originPeakBits: number;   // bit/s the origin sends at peak, the CDN's misses
  readonly uploadHoursPerMinute: number;
  readonly ingestPerDay: number;     // bytes uploaded a day
  readonly storedPerDay: number;     // original and renditions, with overhead
  readonly storedPerYear: number;
  readonly encodeCores: number;      // cores busy on average to keep up with uploads
  readonly outOverIn: number;        // bytes delivered for each byte uploaded
};

export function estimate(a: Assumptions, segmentSeconds = 6): Estimate {
  const watchMinutes = a.viewers * a.minutes;
  const concurrentPeak = watchMinutes / 1440 * a.peak;
  const egressPeakBits = concurrentPeak * a.mbps * 1e6;
  const egressPerDay = watchMinutes * 60 * a.mbps * 1e6 / 8;
  const uploadSeconds = a.uploads * a.length * 60;
  const ingestPerDay = uploadSeconds * a.sourceMbps * 1e6 / 8;
  const storedPerDay = uploadSeconds * (a.sourceMbps + a.ladderMbps) * 1e6 / 8 * a.overhead;
  return {
    watchHoursPerDay: watchMinutes / 60,
    concurrentPeak,
    egressPeakBits,
    egressPerDay,
    segmentRequestsPeak: concurrentPeak / segmentSeconds,
    heartbeatsPeak: concurrentPeak / 30,
    originPeakBits: egressPeakBits * (1 - a.hit),
    uploadHoursPerMinute: uploadSeconds / 3600 / 1440,
    ingestPerDay,
    storedPerDay,
    storedPerYear: storedPerDay * 365,
    encodeCores: uploadSeconds * a.encodeCost / 86400,
    outOverIn: egressPerDay / ingestPerDay,
  };
}

// The same arithmetic at ten and a hundred times the viewers and uploads.
export function grow(a: Assumptions, factor: number): Assumptions {
  return { ...a, viewers: a.viewers * factor, uploads: a.uploads * factor };
}
