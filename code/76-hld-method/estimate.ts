// Step 2 for the pastebin: the estimate as a function, so that every number the chapter quotes is computed here
// and the calculator on the page can be checked against it.

export interface ExpiryChoice {
  readonly label: string;
  readonly days: number;
  readonly share: number; // of new pastes, 0 to 1
}

// What users pick when they create a paste. An assumption, stated in the requirements.
export const EXPIRY_MIX: readonly ExpiryChoice[] = [
  { label: "1 hour", days: 1 / 24, share: 0.1 },
  { label: "1 day", days: 1, share: 0.3 },
  { label: "1 week", days: 7, share: 0.35 },
  { label: "1 month", days: 30, share: 0.2 },
  { label: "1 year", days: 365, share: 0.05 },
];

export function meanLifetimeDays(mix: readonly ExpiryChoice[]): number {
  const total = mix.reduce((sum, c) => sum + c.share, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error("expiry shares must add up to 1");
  return mix.reduce((sum, c) => sum + c.share * c.days, 0);
}

export interface Assumptions {
  readonly dailyUsers: number;
  readonly pastesPerUser: number; // created per user per day
  readonly readsPerUser: number; // pastes opened per user per day
  readonly pasteKb: number; // average size of the text, 1 KB = 1,000 bytes
  readonly daysKept: number; // average lifetime of a paste
  readonly peakFactor: number; // busiest hour compared with the daily average
  readonly metadataBytes: number; // one row with its share of the index
}

export const PASTEBIN: Assumptions = {
  dailyUsers: 2_000_000,
  pastesPerUser: 0.25,
  readsPerUser: 5,
  pasteKb: 10,
  daysKept: 27,
  peakFactor: 3,
  metadataBytes: 300,
};

export interface Estimate {
  readonly pastesPerDay: number;
  readonly readsPerDay: number;
  readonly writesPerSecond: number;
  readonly readsPerSecond: number;
  readonly peakWrites: number;
  readonly peakReads: number;
  readonly readsPerPaste: number;
  readonly livePastes: number; // once the longest lifetime has passed: arrivals x average lifetime (Little's law)
  readonly textBytes: number;
  readonly metadataBytes: number;
  readonly egressBitsPerSecond: number; // average, text only, before compression and headers
  readonly peakEgressBitsPerSecond: number;
  readonly ingressBitsPerSecond: number;
  readonly oneDayOfPastesBytes: number; // what a cache holding every paste created in the last day needs
}

const DAY = 86_400;

export function estimate(a: Assumptions): Estimate {
  const pastesPerDay = a.dailyUsers * a.pastesPerUser;
  const readsPerDay = a.dailyUsers * a.readsPerUser;
  const writesPerSecond = pastesPerDay / DAY;
  const readsPerSecond = readsPerDay / DAY;
  const bytes = a.pasteKb * 1000;
  const livePastes = pastesPerDay * a.daysKept;
  return {
    pastesPerDay,
    readsPerDay,
    writesPerSecond,
    readsPerSecond,
    peakWrites: writesPerSecond * a.peakFactor,
    peakReads: readsPerSecond * a.peakFactor,
    readsPerPaste: readsPerDay / pastesPerDay,
    livePastes,
    textBytes: livePastes * bytes,
    metadataBytes: livePastes * a.metadataBytes,
    egressBitsPerSecond: readsPerSecond * bytes * 8,
    peakEgressBitsPerSecond: readsPerSecond * a.peakFactor * bytes * 8,
    ingressBitsPerSecond: writesPerSecond * bytes * 8,
    oneDayOfPastesBytes: pastesPerDay * bytes,
  };
}

// The same assumptions with more users: the growth questions of step 7.
export function grow(a: Assumptions, factor: number): Assumptions {
  return { ...a, dailyUsers: a.dailyUsers * factor };
}
