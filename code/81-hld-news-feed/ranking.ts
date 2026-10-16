import { Rng } from './rng.ts';

// A ranked feed in miniature. Each candidate post in a reader's feed list has three features: how old it is,
// how much the reader interacts with its author (affinity), and how much engagement it draws (quality).
export type Candidate = { readonly id: number; readonly ageHours: number; readonly affinity: number; readonly quality: number };

export type RankingConfig = {
  readonly candidates: number;   // ids in the reader's feed list
  readonly windowHours: number;  // how far back the list reaches
  readonly authors: number;      // accounts the reader follows
  readonly halfLifeHours: number;
  readonly lightNoise: number;   // how far the cheap model's log score strays from the full model's
  readonly page: number;
};

export const RANKING: RankingConfig = { candidates: 800, windowHours: 72, authors: 60, halfLifeHours: 12, lightNoise: 1.2, page: 20 };

// The full model's score, as a logarithm: affinity times quality, halved every halfLifeHours.
export function fullScore(c: Candidate, cfg: RankingConfig): number {
  return Math.log(c.affinity) + Math.log(c.quality) - (Math.LN2 * c.ageHours) / cfg.halfLifeHours;
}

// One reader's feed list: candidates spread over the window, each from one of the accounts the reader follows.
export function feedList(rng: Rng, cfg: RankingConfig, firstId = 0): Candidate[] {
  const affinity = Array.from({ length: cfg.authors }, () => Math.exp(rng.normal()));
  const list: Candidate[] = [];
  for (let i = 0; i < cfg.candidates; i++) {
    list.push({ id: firstId + i, ageHours: rng.next() * cfg.windowHours, affinity: affinity[rng.below(cfg.authors)] as number, quality: Math.exp(0.7 * rng.normal()) });
  }
  return list;
}

// The ids of the best `n` candidates by a score, best first.
export function top(list: readonly Candidate[], score: (c: Candidate) => number, n: number): number[] {
  return list
    .map((c) => ({ id: c.id, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.id - b.id)
    .slice(0, n)
    .map((x) => x.id);
}

export type FunnelRow = { readonly scored: number; readonly newest: number; readonly funnel: number };

// How many of the page the full model would choose from all candidates are found when the full model
// scores only `k` of them: the k newest, or the k best by a cheap model with noise.
export function funnel(cfg: RankingConfig, readers: number, ks: readonly number[], seed: number): { rows: FunnelRow[]; correlation: number } {
  const rng = new Rng(seed);
  const sums = ks.map(() => ({ newest: 0, funnel: 0 }));
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
  for (let r = 0; r < readers; r++) {
    const list = feedList(rng, cfg);
    const full = new Map(list.map((c) => [c.id, fullScore(c, cfg)]));
    const light = new Map(list.map((c) => [c.id, (full.get(c.id) as number) + cfg.lightNoise * rng.normal()]));
    for (const c of list) {
      const x = full.get(c.id) as number, y = light.get(c.id) as number;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++;
    }
    const ideal = new Set(top(list, (c) => full.get(c.id) as number, cfg.page));
    const byAge = [...list].sort((a, b) => a.ageHours - b.ageHours);
    const byLight = [...list].sort((a, b) => (light.get(b.id) as number) - (light.get(a.id) as number));
    ks.forEach((k, i) => {
      const found = (pool: Candidate[]) => top(pool.slice(0, k), (c) => full.get(c.id) as number, cfg.page).filter((id) => ideal.has(id)).length;
      (sums[i] as { newest: number; funnel: number }).newest += found(byAge) / cfg.page;
      (sums[i] as { newest: number; funnel: number }).funnel += found(byLight) / cfg.page;
    });
  }
  const correlation = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return { rows: ks.map((k, i) => ({ scored: k, newest: (sums[i] as { newest: number }).newest / readers, funnel: (sums[i] as { funnel: number }).funnel / readers })), correlation };
}

// A reader reads page 1, and asks for page 2 half an hour later. Meanwhile new posts arrive, every post
// ages, and engagement changes each post's quality a little. Page 2 is either ranked again from scratch
// or taken from the ranked list saved when page 1 was served.
export function secondPage(cfg: RankingConfig, readers: number, seed: number, newPosts = 10, drift = 0.3) {
  const rng = new Rng(seed);
  let repeats = 0, skipped = 0, arrived = 0, savedRepeats = 0;
  const P = cfg.page;
  for (let r = 0; r < readers; r++) {
    const list = feedList(rng, cfg);
    const saved = top(list, (c) => fullScore(c, cfg), 2 * P);
    const page1 = new Set(saved.slice(0, P));
    const later: Candidate[] = list.map((c) => ({ ...c, ageHours: c.ageHours + 0.5, quality: c.quality * Math.exp(drift * rng.normal()) }));
    const fresh = feedList(rng, { ...cfg, candidates: newPosts, windowHours: 0.5 }, cfg.candidates);
    const now = top([...later, ...fresh], (c) => fullScore(c, cfg), 2 * P);
    // Ranked again, page 2 is positions 21 to 40 of the new order. An older post that has climbed into
    // the top 20 without being on page 1 is never shown: the reader has moved past position 20.
    // A new post in the top 20 waits for the next refresh.
    repeats += now.slice(P).filter((id) => page1.has(id)).length;
    for (const id of now.slice(0, P)) {
      if (page1.has(id)) continue;
      if (id < cfg.candidates) skipped++;
      else arrived++;
    }
    // From the saved list, page 2 is positions 21 to 40 of the order page 1 came from.
    savedRepeats += saved.slice(P).filter((id) => page1.has(id)).length;
  }
  return { readers, repeats: repeats / readers, skipped: skipped / readers, arrived: arrived / readers, savedRepeats: savedRepeats / readers };
}
