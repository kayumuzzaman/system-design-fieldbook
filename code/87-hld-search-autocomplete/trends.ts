// How quickly a sudden trend reaches the suggestions, and how long it stays, under four ways of
// counting. One prefix is modeled: ten established queries with steady hourly volumes, and one new
// query that appears at hour 0, peaks for a day, then fades.

export type Strategy = { readonly name: string; readonly rebuildEveryHours: number; score(history: readonly number[], now: number): number };

// history[h] = searches in hour h, for h < now (negative hours are the year before the trend)
const sumRange = (h: readonly number[], from: number, to: number) => {
  let s = 0;
  for (let i = Math.max(0, from); i < to; i += 1) s += h[i] as number;
  return s;
};

export const strategies = (yearHours: number): Strategy[] => [
  { name: "all-time counts, rebuilt daily", rebuildEveryHours: 24, score: (h, now) => sumRange(h, 0, yearHours + now) },
  { name: "last 7 days, rebuilt daily", rebuildEveryHours: 24, score: (h, now) => sumRange(h, yearHours + now - 168, yearHours + now) },
  { name: "last 7 days, rebuilt hourly", rebuildEveryHours: 1, score: (h, now) => sumRange(h, yearHours + now - 168, yearHours + now) },
  {
    name: "decayed, half-life 1 day, hourly",
    rebuildEveryHours: 1,
    score: (h, now) => {
      let s = 0;
      for (let i = 0; i < yearHours + now; i += 1) s += (h[i] as number) * 0.5 ** ((yearHours + now - 1 - i) / 24);
      return s;
    },
  },
];

// Hourly volume of the trending query: rises over 3 hours to `peak`, holds for 24, then halves every 12 hours.
export const trendVolume = (hour: number, peak: number) =>
  hour < 0 ? 0 : hour < 3 ? (peak * (hour + 1)) / 3 : hour < 27 ? peak : peak * 0.5 ** ((hour - 27) / 12);

// For each hour after the trend starts: the trending query's rank among all candidates for the prefix,
// using the suggestion list as last rebuilt. Rank 1 is the top; k + 1 means "not shown".
export function rankOverTime(opts: { established: number[]; peak: number; hours: number; k: number; yearHours?: number; offsetHours?: number }) {
  const yearHours = opts.yearHours ?? 365 * 24;
  const offset = opts.offsetHours ?? 7; // the trend starts at 7 in the morning; daily rebuilds run at midnight
  const histories = opts.established.map((v) => Array.from({ length: yearHours + opts.hours }, () => v));
  const trend = Array.from({ length: yearHours + opts.hours }, (_, i) => trendVolume(i - yearHours, opts.peak));
  return strategies(yearHours).map((st) => {
    const ranks: number[] = [];
    let shownRank = opts.k + 1;
    for (let now = 0; now < opts.hours; now += 1) {
      if ((now + offset) % st.rebuildEveryHours === 0) {
        const t = st.score(trend, now);
        const above = histories.filter((h) => st.score(h, now) > t).length;
        shownRank = t > 0 && above < opts.k ? above + 1 : opts.k + 1;
      }
      ranks.push(shownRank);
    }
    const shown = ranks.map((r, h) => (r <= opts.k ? h : -1)).filter((h) => h >= 0);
    return { strategy: st.name, ranks, firstShown: shown.length ? shown[0] : null, lastShown: shown.length ? shown[shown.length - 1] : null };
  });
}
