// Prints the data behind the chapter's figures as JSON. Seeded, so the same on every run.
import { Counter, embeddingLike, exactSearch, recall, type Vector } from "./vectors.ts";
import { IvfIndex } from "./ivf.ts";
import { Hnsw } from "./hnsw.ts";
import { seeded } from "./random.ts";
import { ARTICLES } from "./corpus.ts";
import { contains, fixedChunks, paragraphChunks, type Chunk } from "./chunk.ts";
import { tokenize } from "./text.ts";

// A small graph in two dimensions, to draw: 40 points, closeness = minus the squared distance.
const random = seeded(20);
const points = Array.from({ length: 40 }, () => Float32Array.from([random(), random()]));
const flat = new Hnsw(4, 16, 20, (a, b) => -(((a[0] as number) - (b[0] as number)) ** 2 + ((a[1] as number) - (b[1] as number)) ** 2));
points.forEach((p) => flat.add(p));
const query = Float32Array.from([0.8, 0.2]);
const path: number[][] = [];
flat.search(query, 1, 8, undefined, path);
const graph = {
  points: points.map((p, id) => ({ x: Number((p[0] as number).toFixed(4)), y: Number((p[1] as number).toFixed(4)), top: flat.layerOf(id) })),
  links: [0, 1, 2].map((layer) => points.flatMap((_, id) => flat.neighbors(id, layer).filter((n) => n > id || !flat.neighbors(n, layer).includes(id)).map((n) => [id, n]))),
  query: [0.8, 0.2], path,
};

const all = embeddingLike(10_200, 64, 1, 50, 24, 1.0);
const data = all.slice(0, 10_000), queries = all.slice(10_000);
const truth = queries.map((q) => exactSearch(data, q, 10));
const measure = (search: (q: Vector, c: Counter) => { id: number; score: number }[]) => {
  const c = new Counter();
  let r = 0;
  queries.forEach((q, i) => { r += recall(search(q, c), truth[i] as { id: number; score: number }[]); });
  return { recall: Number((r / queries.length).toFixed(3)), compared: Math.round(c.n / queries.length) };
};
const ivf = new IvfIndex(data, 100);
const hnsw = new Hnsw(12, 64);
data.forEach((v) => hnsw.add(v));
const tradeoff = {
  ivf: [1, 2, 4, 8, 16, 32].map((probes) => ({ probes, ...measure((q, c) => ivf.search(q, 10, probes, c)) })),
  hnsw: [10, 20, 40, 80, 160].map((ef) => ({ ef, ...measure((q, c) => hnsw.search(q, 10, ef, c)) })),
};

// Where the chunk boundaries fall in one article, and where the answer to one question lies, in tokens.
const article = ARTICLES.find((a) => a.id === "sync") as (typeof ARTICLES)[number];
const answer = "Screenshots and downloads folders are not backed up unless you choose them";
const at = article.body.indexOf(answer);
const spans = (chunks: Chunk[], step: number) => chunks.map((c, i) => ({ start: i * step, tokens: c.tokens, hasAnswer: contains(c, answer), words: c.text.split(/\s+/).slice(0, 3).join(" ") }));
let offset = 0;
const paragraphs = paragraphChunks(article).map((c) => { const r = { start: offset, tokens: c.tokens, hasAnswer: contains(c, answer), words: c.text.split(/\s+/).slice(0, 3).join(" ") }; offset += c.tokens; return r; });
const chunking = {
  article: article.title, answer, total: tokenize(article.body).length,
  answerStart: tokenize(article.body.slice(0, at)).length, answerEnd: tokenize(article.body.slice(0, at + answer.length)).length,
  fixed32: spans(fixedChunks(article, 32), 32), overlap: spans(fixedChunks(article, 32, 8), 24), paragraphs,
};
console.log(JSON.stringify({ graph, tradeoff, chunking }));
