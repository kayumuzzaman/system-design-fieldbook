// A synthetic query log: made-up words built from syllables, queries of one to three words,
// and a long-tailed popularity like real search logs. Seeded, so every run is the same.
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// Picks index i with probability proportional to 1 / (i + 1)^s.
export function zipfPicker(n: number, s: number, random: () => number): () => number {
  const cum = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i += 1) cum[i] = total += 1 / (i + 1) ** s;
  return () => {
    const x = random() * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cum[mid] as number) < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

const syllables = ["sa", "ma", "ta", "ka", "ra", "na", "la", "pa", "ba", "da", "se", "me", "te", "re", "ne", "le", "pe", "be", "de", "ke",
  "si", "mi", "ti", "ri", "ni", "li", "pi", "bi", "di", "ki", "so", "mo", "to", "ro", "no", "lo", "po", "bo", "do", "ko",
  "su", "mu", "tu", "ru", "nu", "lu", "pu", "bu", "du", "ku", "an", "en", "in", "on", "ar", "er", "or", "al", "el", "ol",
  "cha", "sha", "tho", "gre", "bla", "fro", "wi", "wa", "ve", "vo", "ho", "ha", "fa", "fi", "go", "gu", "ja", "jo", "yo", "zi"];

export type Query = { readonly text: string; readonly count: number };

// `unique` distinct queries, with counts falling off as 1 / rank: the most popular is searched
// `top` times, the thousandth about top / 1000 times.
export function makeCorpus(unique: number, seed = 87, top = 1_000_000): Query[] {
  const random = seeded(seed);
  const syl = zipfPicker(syllables.length, 0.8, random);
  const words: string[] = [];
  const seenWords = new Set<string>();
  while (words.length < Math.max(2000, unique / 5)) {
    const n = 1 + Math.floor(random() * 3);
    let w = "";
    for (let i = 0; i < n; i += 1) w += syllables[syl()];
    if (!seenWords.has(w)) { seenWords.add(w); words.push(w); }
  }
  const word = zipfPicker(words.length, 1.0, random);
  const out: Query[] = [];
  const seen = new Set<string>();
  while (out.length < unique) {
    const n = 1 + Math.floor(random() * 3);
    const q = Array.from({ length: n }, () => words[word()]).join(" ");
    if (seen.has(q)) continue;
    seen.add(q);
    out.push({ text: q, count: Math.max(1, Math.round(top / (out.length + 1))) });
  }
  return out;
}
