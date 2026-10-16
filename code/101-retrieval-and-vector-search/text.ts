import { unit, type Vector } from "./vectors.ts";

// The rough tokenizer of the previous chapter, used here to measure chunk sizes in tokens.
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/\s*(?:[A-Za-z’']+|\d|[^\sA-Za-z\d’'])/g)) {
    const piece = match[0];
    const lead = piece.length - piece.trimStart().length;
    const word = piece.slice(lead);
    if (word.length <= 6) { tokens.push(piece); continue; }
    for (let i = 0; i < word.length; i += 5) tokens.push((i === 0 ? piece.slice(0, lead) : "") + word.slice(i, i + 5));
  }
  return tokens;
}

const STOP = new Set(("a an the i my me you your to do does how can is are was what of for in on at with from it its and or be " +
  "if when will that this they them their there by as not no into so up any all").split(" "));
// Exact words, lowercased, without the commonest ones. "E-403" stays one word.
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter((w) => !STOP.has(w));
}

// --- A stand-in for an embedding model. It folds word endings and a few synonyms together, so that
// "deleted pictures" and "delete photos" meet, and hashes what is left into 256 numbers, so that rare
// words share places with others, as a learned model blurs rare identifiers. Built from document
// frequencies, so that common words count for less.
const SAME: Record<string, string> = { picture: "photo", image: "photo", bin: "trash", erase: "delete", remove: "delete",
  recover: "restore", unshare: "stop-share", space: "storage", money: "refund", mother: "person", people: "person",
  website: "web", hide: "hidden", undo: "revert", subscription: "plan" };
function stem(w: string): string {
  const base = w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  const root = base.length > 5 && base.endsWith("ed") ? base.slice(0, -1) : base.length > 6 && base.endsWith("ing") ? base.slice(0, -3) : base;
  return SAME[w] ?? SAME[base] ?? SAME[root] ?? root;
}
export const meaningWords = (text: string): string[] => words(text).map(stem);

export class StandInEmbedder {
  private readonly idf = new Map<string, number>();
  private readonly dims: number;
  constructor(corpus: readonly string[], dims = 256) {
    this.dims = dims;
    const df = new Map<string, number>();
    for (const doc of corpus) for (const w of new Set(meaningWords(doc))) df.set(w, (df.get(w) ?? 0) + 1);
    for (const [w, n] of df) this.idf.set(w, Math.log(1 + corpus.length / n));
  }
  embed(text: string): Vector {
    const v = new Float32Array(this.dims);
    for (const w of meaningWords(text)) {
      let h = 2166136261;
      for (let i = 0; i < w.length; i += 1) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
      const slot = (h >>> 0) % this.dims;
      v[slot] = (v[slot] as number) + (this.idf.get(w) ?? Math.log(2));
    }
    return unit(v);
  }
}

// --- Keyword search: BM25 over exact words, as in the search systems chapter.
export class Bm25 {
  private readonly docs: string[][];
  private readonly df = new Map<string, number>();
  private readonly avg: number;
  constructor(texts: readonly string[]) {
    this.docs = texts.map(words);
    for (const d of this.docs) for (const w of new Set(d)) this.df.set(w, (this.df.get(w) ?? 0) + 1);
    this.avg = this.docs.reduce((a, d) => a + d.length, 0) / Math.max(1, this.docs.length);
  }
  score(query: string, doc: number, k1 = 1.2, b = 0.75): number {
    const d = this.docs[doc] as string[];
    let s = 0;
    for (const w of new Set(words(query))) {
      const tf = d.filter((x) => x === w).length;
      if (tf === 0) continue;
      const n = this.df.get(w) ?? 0;
      const idf = Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
      s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / this.avg));
    }
    return s;
  }
  rank(query: string): number[] {
    return this.docs.map((_, i) => ({ i, s: this.score(query, i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.i);
  }
}

// Reciprocal rank fusion: each list gives a document 1 / (60 + its rank). Only positions are used, so the
// two kinds of score never need to be comparable.
export function fuse(lists: readonly (readonly number[])[], k = 60): number[] {
  const score = new Map<number, number>();
  for (const list of lists) list.forEach((doc, rank) => score.set(doc, (score.get(doc) ?? 0) + 1 / (k + rank + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([doc]) => doc);
}

// A stand-in for a reranking model, which reads the question and one passage together. This one scores how
// much of the question a passage covers, in meaning words and in exact words. It is too slow to run over
// everything in a real system, so it only reorders the candidates the first stage found.
export function rerank(question: string, candidates: readonly { id: number; text: string }[]): number[] {
  const qm = new Set(meaningWords(question)), qe = new Set(words(question));
  const covered = (q: Set<string>, c: Set<string>) => [...q].filter((w) => c.has(w)).length / Math.max(1, q.size);
  return candidates.map((c) => ({ id: c.id, s: covered(qm, new Set(meaningWords(c.text))) + 0.5 * covered(qe, new Set(words(c.text))) }))
    .sort((a, b) => b.s - a.s).map((x) => x.id);
}
