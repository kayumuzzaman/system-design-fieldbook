// The simulations behind the chapter's numbers. Each is seeded, so it prints the same result every run.
import { spaceOf } from "./base62.ts";
import { Rng } from "./rng.ts";
import { hashCode, Scrambler, RangeCoordinator, CodeServer } from "./keys.ts";
import { Zipf, harmonic } from "./zipf.ts";
import { LruCache } from "./lru.ts";
import { lruHitsBySize } from "./stackdistance.ts";

// Birthday arithmetic: among n codes drawn at random from N, the expected number of pairs that are
// equal, and the chance that there is at least one such pair.
export const expectedPairs = (n: number, N: number) => (n * (n - 1)) / (2 * N);
export const collisionChance = (n: number, N: number) => 1 - Math.exp(-expectedPairs(n, N));

// A. Draw random 4-character codes until one repeats, many times over.
export function firstRepeat(trials = 2000, length = 4, seed = 1) {
  const N = spaceOf(length);
  const rng = new Rng(seed);
  const firsts: number[] = [];
  for (let t = 0; t < trials; t++) {
    const seen = new Set<number>();
    for (;;) {
      const code = rng.below(N);
      if (seen.has(code)) break;
      seen.add(code);
    }
    firsts.push(seen.size + 1); // the number of codes drawn, the repeat included
  }
  firsts.sort((a, b) => a - b);
  const points = [];
  for (let n = 1000; n <= 13000; n += 1000) {
    points.push({ n, measured: firsts.filter((f) => f <= n).length / trials, formula: collisionChance(n, N) });
  }
  const mean = firsts.reduce((a, b) => a + b, 0) / trials;
  return { N, trials, median: firsts[trials / 2], mean, halfByFormula: Math.sqrt(2 * N * Math.log(2)), points };
}

// B. Random 7-character codes at real scale: how many of the first n of 20 million were drawn before.
// A set of 20 million codes, as a hash table in one typed array (0 marks an empty slot, so code + 1 is stored).
export function repeatsAtScale(checkpoints = [2e6, 5e6, 1e7, 2e7], length = 7, seed = 2) {
  const N = spaceOf(length);
  const rng = new Rng(seed);
  const slots = 2 ** 25;
  const table = new Float64Array(slots);
  const out = [];
  let repeats = 0;
  let drawn = 0;
  for (const n of checkpoints) {
    for (; drawn < n; drawn++) {
      const code = rng.below(N) + 1;
      let i = code % slots; // codes are random, so their low bits spread them evenly
      while (table[i] !== 0 && table[i] !== code) i = (i + 1) % slots;
      if (table[i] === code) repeats++;
      else table[i] = code;
    }
    out.push({ n, repeats, formula: expectedPairs(n, N) });
  }
  return out;
}

// C. Fill a 4-character space with random codes, retrying on a taken code, and measure the attempts
// that inserts need at each level of fill. Only the share that is full matters, not the size.
export function retriesByFill(fills = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99], window = 20_000, length = 4, seed = 3) {
  const N = spaceOf(length);
  const used = new Uint8Array(N);
  const rng = new Rng(seed);
  let count = 0;
  const insert = (): number => {
    for (let attempts = 1; ; attempts++) {
      const code = rng.below(N);
      if (!used[code]) {
        used[code] = 1;
        count++;
        return attempts;
      }
    }
  };
  return fills.map((fill) => {
    while (count < Math.round(fill * N)) insert();
    let total = 0;
    let most = 0;
    let threeOrMore = 0;
    for (let i = 0; i < window; i++) {
      const a = insert();
      total += a;
      most = Math.max(most, a);
      if (a >= 3) threeOrMore++;
    }
    return { fill, mean: total / window, formula: 1 / (1 - fill), most, threeOrMore: threeOrMore / window, threeOrMoreFormula: fill * fill };
  });
}

// D. A hash of the URL, cut to 3 characters, against random 3-character codes: equal pairs among 1,000.
export function hashVersusRandom(urls = 1000, sets = 200, length = 3, seed = 4) {
  const N = spaceOf(length);
  const rng = new Rng(seed);
  const pairsIn = (codes: (string | number)[]) => {
    const seen = new Map<string | number, number>();
    let pairs = 0;
    for (const c of codes) {
      const k = seen.get(c) ?? 0;
      pairs += k;
      seen.set(c, k + 1);
    }
    return pairs;
  };
  let hashed = 0;
  let random = 0;
  for (let s = 0; s < sets; s++) {
    const hashCodes: string[] = [];
    const randomCodes: number[] = [];
    for (let i = 0; i < urls; i++) {
      hashCodes.push(hashCode(`https://example.com/articles/${s}/${i}`, 0, length));
      randomCodes.push(rng.below(N));
    }
    hashed += pairsIn(hashCodes);
    random += pairsIn(randomCodes);
  }
  return { urls, sets, N, hashed: hashed / sets, random: random / sets, formula: expectedPairs(urls, N) };
}

// E. Twenty servers issue codes from counter ranges while some of them restart.
export function counterRanges(sizes = [100, 1000, 10_000, 100_000], writes = 10_000_000, servers = 20, restarts = 40, writesPerSecond = 100_000_000 / 86_400, seed = 5) {
  return sizes.map((size) => {
    const rng = new Rng(seed);
    const coordinator = new RangeCoordinator(size);
    const fleet = Array.from({ length: servers }, () => new CodeServer(coordinator));
    const restartAt = Array.from({ length: restarts }, () => rng.below(writes)).sort((a, b) => a - b);
    const seen = new Uint8Array(writes + (restarts + servers + 1) * size); // every value that could be issued
    let duplicates = 0;
    let wasted = 0;
    let r = 0;
    for (let w = 0; w < writes; w++) {
      while (r < restartAt.length && restartAt[r] === w) {
        wasted += fleet[rng.next32() % servers].restart();
        r++;
      }
      const n = fleet[rng.next32() % servers].nextNumber();
      if (seen[n]) duplicates++;
      seen[n] = 1;
    }
    const seconds = writes / writesPerSecond;
    return { size, leases: coordinator.leases, leasesPerSecond: coordinator.leases / seconds, wasted, wastedShare: wasted / writes, duplicates };
  });
}

// F. Can someone who holds one code find others by counting? Plain and scrambled counters,
// 1,000,000 links issued, and the 1,000 codes that follow a known one in base 62 order.
export function counting(issuedCount = 1_000_000, tries = 1000, length = 7) {
  const space = spaceOf(length);
  const scrambler = new Scrambler(space, [0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c]);
  const plain = new Set<number>();
  const scrambled = new Set<number>();
  for (let i = 0; i < issuedCount; i++) {
    plain.add(i);
    scrambled.add(scrambler.permute(i));
  }
  const known = issuedCount / 2;
  let plainHits = 0;
  let scrambledHits = 0;
  const knownScrambled = scrambler.permute(known);
  for (let k = 1; k <= tries; k++) {
    if (plain.has(known + k)) plainHits++;
    if (scrambled.has((knownScrambled + k) % space)) scrambledHits++;
  }
  return { issuedCount, tries, plainHits, scrambledHits, scrambledDistinct: scrambled.size, firstFive: [0, 1, 2, 3, 4].map((i) => scrambler.permute(i)) };
}

// Is the scrambler a permutation? Shuffle every value of a 4-character space and look for repeats.
export function scramblerIsPermutation(length = 4) {
  const space = spaceOf(length);
  const scrambler = new Scrambler(space, [0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c]);
  const seen = new Uint8Array(space);
  let repeats = 0;
  for (let n = 0; n < space; n++) {
    const x = scrambler.permute(n);
    if (seen[x]) repeats++;
    seen[x] = 1;
  }
  return { space, repeats };
}

// G. Hit ratio of an LRU cache in front of the links, when clicks follow Zipf's law.
// One million links and ten million clicks; the first million clicks only warm the cache.
export function cacheHitRatio(links = 1_000_000, skews = [0.8, 1], shares = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2], clicks = 10_000_000, warm = 1_000_000, seed = 6) {
  return skews.map((skew) => {
    const zipf = new Zipf(links, skew);
    const rng = new Rng(seed);
    const stream = new Int32Array(clicks);
    for (let i = 0; i < clicks; i++) stream[i] = zipf.sample(rng);
    const sizes = shares.map((share) => Math.round(share * links));
    const lru = lruHitsBySize(stream, links, sizes, warm);
    const rows = lru.bySize.map(({ size, hits }, i) => ({ share: shares[i], entries: size, lru: hits / lru.measured, best: zipf.topShare(size) }));
    // The best possible at 20% for 100 million links, by formula rather than by simulation.
    const big = 100_000_000;
    const bestAt100M = harmonic(big * 0.2, skew) / harmonic(big, skew);
    return { skew, rows, firstUses: lru.firstUses / lru.measured, bestAt100M };
  });
}

// The one-pass method must agree exactly with the LRU class it stands in for.
export function stackDistanceAgrees(links = 20_000, clicks = 300_000, sizes = [10, 100, 1000, 5000], seed = 8) {
  const zipf = new Zipf(links, 0.9);
  const rng = new Rng(seed);
  const stream = new Int32Array(clicks);
  for (let i = 0; i < clicks; i++) stream[i] = zipf.sample(rng);
  const fast = lruHitsBySize(stream, links, sizes);
  return sizes.map((size, i) => {
    const cache = new LruCache<number, true>(size);
    let hits = 0;
    for (const link of stream) {
      if (cache.get(link)) hits++;
      else cache.put(link, true);
    }
    return { size, lruClass: hits, onePass: fast.bySize[i].hits };
  });
}

// H. Counting clicks: one write for each click, or one for each link in each window of time.
export function aggregation(links = 1_000_000, skew = 1, perSecond = Math.round((100 * 100_000_000) / 86_400), seconds = 60, windows = [1, 10, 60], seed = 7) {
  const zipf = new Zipf(links, skew);
  const rng = new Rng(seed);
  const last = windows.map(() => new Int32Array(links).fill(-1));
  const writes = windows.map(() => 0);
  let top = 0;
  for (let s = 0; s < seconds; s++) {
    for (let c = 0; c < perSecond; c++) {
      const link = zipf.sample(rng);
      if (link === 0) top++;
      for (let w = 0; w < windows.length; w++) {
        const index = Math.floor(s / windows[w]);
        if (last[w][link] !== index) {
          last[w][link] = index;
          writes[w]++;
        }
      }
    }
  }
  return {
    perSecond,
    hottestPerSecond: top / seconds,
    windows: windows.map((w, i) => ({ seconds: w, writesPerSecond: writes[i] / seconds })),
  };
}
