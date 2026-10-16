// Seeded click events: ads chosen by a skewed (Zipf) popularity, event times spread over a period,
// network and app delays with a long tail, and some clicks sent twice by retrying clients.
// Every number here is an assumption of the model, chosen to look like a mobile-heavy ad network.
export interface Click {
  readonly id: number;        // the click id, the same in every copy of one click
  readonly ad: number;
  readonly time: number;      // event time: when the user clicked (ms)
  readonly arrival: number;   // when the copy reached the pipeline (ms)
}

export interface Model {
  readonly clicks: number;
  readonly periodMs: number;
  readonly ads: number;
  readonly zipf: number;          // popularity exponent
  readonly retryShare: number;    // clicks sent a second time
}
export const defaults: Model = { clicks: 600_000, periodMs: 2 * 3600_000, ads: 20_000, zipf: 1.0, retryShare: 0.02 };

// Inverse-CDF sampling over ranks 0..n-1 with weight 1 / (rank + 1)^s.
export function zipf(random: () => number, n: number, s: number): () => number {
  const cdf = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i += 1) { sum += 1 / (i + 1) ** s; cdf[i] = sum; }
  return () => {
    const u = random() * sum;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((cdf[mid] as number) < u) lo = mid + 1; else hi = mid; }
    return lo;
  };
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

// How long a click takes to reach the pipeline: usually under a second, sometimes a minute
// (an app sending in batches), occasionally hours (a phone that was offline).
export function delay(random: () => number): number {
  const r = random();
  if (r < 0.95) return Math.exp(Math.log(400) + 1.0 * gaussian(random));   // median 0.4 s
  if (r < 0.995) return random() * 60_000;                                   // up to a minute
  return 60_000 + random() * 2 * 3600_000;                                   // 1 minute to 2 hours
}

// A retry comes a little later, or, for one in ten, when the app is next opened, up to 6 hours later.
function retryGap(random: () => number): number {
  return random() < 0.9 ? -Math.log(1 - random()) * 20_000 : 600_000 + random() * 6 * 3600_000;
}

export function generate(random: () => number, m: Model = defaults): Click[] {
  const pickAd = zipf(random, m.ads, m.zipf);
  const out: Click[] = [];
  for (let id = 1; id <= m.clicks; id += 1) {
    const time = Math.floor(random() * m.periodMs);
    const ad = pickAd();
    const first = time + Math.round(delay(random));
    out.push({ id, ad, time, arrival: first });
    if (random() < m.retryShare) out.push({ id, ad, time, arrival: first + Math.round(retryGap(random)) });
  }
  return out.sort((a, b) => a.arrival - b.arrival || a.id - b.id);
}
