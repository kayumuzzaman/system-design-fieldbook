import assert from "node:assert/strict";
import { Counter, dot, embeddingLike, exactSearch, recall, type Vector } from "./vectors.ts";
import { IvfIndex } from "./ivf.ts";
import { Hnsw } from "./hnsw.ts";
import { agreeing, ScalarQuantizer, searchCompressed, signBits } from "./quantize.ts";
import { ARTICLES, QUESTIONS, type Article } from "./corpus.ts";
import { contains, fixedChunks, paragraphChunks, wholeArticle, type Chunk } from "./chunk.ts";
import { Bm25, fuse, rerank, StandInEmbedder, tokenize } from "./text.ts";
import { assemblePrompt, Retriever } from "./rag.ts";

// --- Exact search and recall, by hand
{
  const v = [[1, 0], [0.6, 0.8], [0, 1], [-1, 0]].map((x) => Float32Array.from(x));
  const c = new Counter();
  assert.deepEqual(exactSearch(v, Float32Array.from([0.8, 0.6]), 2, c).map((h) => h.id), [1, 0]);
  assert.equal(c.n, 4); // one comparison for every stored vector
  assert.equal(recall([{ id: 1, score: 0 }, { id: 3, score: 0 }], [{ id: 1, score: 0 }, { id: 0, score: 0 }]), 0.5);
}

// --- 10,000 vectors of 64 numbers, and 200 queries from the same distribution
const all = embeddingLike(10_200, 64, 1, 50, 24, 1.0);
const data = all.slice(0, 10_000), queries = all.slice(10_000);
const truth = queries.map((q) => exactSearch(data, q, 10));
const measure = (search: (q: Vector, c: Counter) => { id: number; score: number }[]) => {
  const c = new Counter();
  let r = 0;
  queries.forEach((q, i) => { r += recall(search(q, c), truth[i] as { id: number; score: number }[]); });
  return { recall: r / queries.length, compared: Math.round(c.n / queries.length) };
};
console.log(`exact search: 10,000 comparisons a query, recall 1`);

{
  const build = new Counter();
  const ivf = new IvfIndex(data, 100, 1, 10, build);
  let before = 0;
  const rows: string[] = [];
  for (const probes of [1, 2, 4, 8, 16, 32]) {
    const m = measure((q, c) => ivf.search(q, 10, probes, c));
    rows.push(`${probes}: ${(m.recall * 100).toFixed(1)}% with ${m.compared}`);
    assert.ok(m.recall >= before);
    before = m.recall;
  }
  const sizes = ivf.lists.map((l) => l.length);
  console.log(`IVF, 100 clusters (lists of ${Math.min(...sizes)} to ${Math.max(...sizes)}), built with ${(build.n / 1e6).toFixed(1)} million comparisons; recall@10 by clusters searched: ${rows.join("; ")}`);
}

const hnsw = new Hnsw(12, 64);
for (const v of data) hnsw.add(v);
{
  const rows: string[] = [];
  let before = 0;
  for (const ef of [10, 20, 40, 80, 160]) {
    const m = measure((q, c) => hnsw.search(q, 10, ef, c));
    rows.push(`${ef}: ${(m.recall * 100).toFixed(1)}% with ${m.compared}`);
    assert.ok(m.recall >= before);
    before = m.recall;
  }
  const links = hnsw.linkCount();
  const layers = [0, 1, 2, 3].map((l) => data.filter((_, i) => hnsw.layerOf(i) >= l).length);
  console.log(`HNSW, m 12: nodes on layers 0 to 3: ${layers.join(", ")}; ${links.toLocaleString("en-US")} links (${(links / data.length).toFixed(1)} a node, ` +
    `${((links * 4) / 1e6).toFixed(2)} MB as 4-byte ids, beside ${((data.length * 64 * 4) / 1e6).toFixed(2)} MB of vectors); ` +
    `built with ${(hnsw.build.n / 1e6).toFixed(1)} million comparisons; recall@10 by ef: ${rows.join("; ")}`);
}

// --- Compressed vectors
{
  const sq = new ScalarQuantizer(data);
  const bytes = data.map((v) => sq.encode(v));
  const back = bytes.map((b) => sq.decode(b));
  const bits = data.map(signBits);
  assert.equal((bytes[0] as Uint8Array).length, 64);
  assert.equal((bits[0] as Uint8Array).length, 8);
  const rows: string[] = [];
  for (const recheck of [10, 40, 100]) {
    const a = measure((q) => searchCompressed((id) => dot(q, back[id] as Vector), data.length, data, q, 10, recheck));
    const qb = (q: Vector) => signBits(q);
    const b = measure((q) => { const s = qb(q); return searchCompressed((id) => agreeing(s, bits[id] as Uint8Array), data.length, data, q, 10, recheck); });
    rows.push(`recheck ${recheck}: one byte ${(a.recall * 100).toFixed(1)}%, one bit ${(b.recall * 100).toFixed(1)}%`);
  }
  console.log(`compressed, 256 bytes a vector becomes 64 (one byte a number) or 8 (one bit): recall@10 ${rows.join("; ")}`);
}

// --- Filtering: each vector belongs to one of 20 users; a query wants one user's 10 nearest
{
  const owner = (id: number) => id % 20;
  let post10 = 0, post200 = 0, pre = 0, preCompared = 0;
  queries.forEach((q, i) => {
    const user = i % 20;
    const mine = data.map((v, id) => ({ v, id })).filter((x) => owner(x.id) === user);
    const c = new Counter();
    const want = exactSearch(mine.map((x) => x.v), q, 10, c).map((h) => ({ id: (mine[h.id] as { id: number }).id, score: h.score }));
    preCompared += c.n;
    post10 += hnsw.search(q, 10, 40).filter((h) => owner(h.id) === user).length;
    const wide = hnsw.search(q, 200, 200).filter((h) => owner(h.id) === user).slice(0, 10);
    post200 += recall(wide, want);
    pre += recall(want, want);
  });
  console.log(`filter to one user of 20: nearest 10 then filter: ${(post10 / queries.length).toFixed(1)} results of 10; ` +
    `nearest 200 then filter: recall ${((post200 / queries.length) * 100).toFixed(1)}%; the user's own ${preCompared / queries.length} vectors scanned exactly: recall ${((pre / queries.length) * 100).toFixed(0)}%`);
}

// --- Chunking the help center, and how often the right passage is retrieved
const help = ARTICLES.filter((a) => a.audience !== "staff");
const corpusTokens = help.reduce((s, a) => s + tokenize(a.body).length, 0);
console.log(`help center: ${help.length} articles, ${corpusTokens} tokens, ${QUESTIONS.length} questions`);
function evaluate(chunks: Chunk[]) {
  const texts = chunks.map((c) => c.text);
  const embedder = new StandInEmbedder(texts), vectors = texts.map((t) => embedder.embed(t)), keywords = new Bm25(texts);
  const r = { intact: 0, vector1: 0, vector3: 0, keyword1: 0, keyword3: 0, hybrid1: 0, hybrid3: 0, reranked1: 0, reranked3: 0, tokens: 0 };
  for (const q of QUESTIONS) {
    const qv = embedder.embed(q.text);
    const byMeaning = vectors.map((v, i) => ({ i, s: dot(v, qv) })).sort((a, b) => b.s - a.s).map((x) => x.i);
    const byWords = keywords.rank(q.text);
    const hybrid = fuse([byMeaning.slice(0, 20), byWords.slice(0, 20)]);
    const reranked = rerank(q.text, hybrid.slice(0, 20).map((i) => ({ id: i, text: (chunks[i] as Chunk).text })));
    const at = (list: number[], k: number) => (list.slice(0, k).some((i) => contains(chunks[i] as Chunk, q.answer)) ? 1 : 0);
    r.intact += chunks.some((c) => contains(c, q.answer)) ? 1 : 0;
    r.vector1 += at(byMeaning, 1); r.vector3 += at(byMeaning, 3);
    r.keyword1 += at(byWords, 1); r.keyword3 += at(byWords, 3);
    r.hybrid1 += at(hybrid, 1); r.hybrid3 += at(hybrid, 3);
    r.reranked1 += at(reranked, 1); r.reranked3 += at(reranked, 3);
    r.tokens += hybrid.slice(0, 3).reduce((s, i) => s + (chunks[i] as Chunk).tokens, 0);
  }
  return { ...r, chunks: chunks.length, tokens: Math.round(r.tokens / QUESTIONS.length) };
}
const strategies: [string, (a: Article) => Chunk[]][] = [
  ["16 tokens", (a) => fixedChunks(a, 16)], ["32 tokens", (a) => fixedChunks(a, 32)], ["64 tokens", (a) => fixedChunks(a, 64)],
  ["128 tokens", (a) => fixedChunks(a, 128)], ["32, overlap 8", (a) => fixedChunks(a, 32, 8)], ["64, overlap 16", (a) => fixedChunks(a, 64, 16)],
  ["paragraphs", paragraphChunks], ["whole articles", wholeArticle]];
const results = new Map<string, ReturnType<typeof evaluate>>();
for (const [name, cut] of strategies) {
  const r = evaluate(help.flatMap(cut));
  results.set(name, r);
  console.log(`chunks of ${name}: ${r.chunks} chunks, answer intact in one chunk for ${r.intact} of 30, in the top 3 (hybrid) for ${r.hybrid3}, ${r.tokens} tokens sent`);
}
{
  const p = results.get("paragraphs") as ReturnType<typeof evaluate>;
  console.log(`paragraph chunks, found at rank 1 / in top 3: vector ${p.vector1}/${p.vector3}, keyword ${p.keyword1}/${p.keyword3}, ` +
    `hybrid ${p.hybrid1}/${p.hybrid3}, hybrid then reranked ${p.reranked1}/${p.reranked3}`);
  assert.ok(p.hybrid3 >= p.vector3 && p.hybrid3 >= p.keyword3);
  assert.ok((results.get("16 tokens") as ReturnType<typeof evaluate>).intact < 20);
  assert.ok((results.get("64, overlap 16") as ReturnType<typeof evaluate>).intact > (results.get("64 tokens") as ReturnType<typeof evaluate>).intact);
}

// --- Permissions, and the prompt
{
  const retriever = new Retriever(ARTICLES);
  const asCustomer = retriever.search("Can I get my money back?", 3, false);
  const asStaff = retriever.search("Can I get my money back?", 3, true);
  assert.ok(asCustomer.every((c) => c.article !== "staff-refunds"));
  assert.ok(asStaff.some((c) => c.article === "staff-refunds"));
  console.log(`"Can I get my money back?" as a customer: ${asCustomer.map((c) => c.article).join(", ")}; as staff: ${asStaff.map((c) => c.article).join(", ")}`);
  const { prompt, used } = assemblePrompt("How long do deleted pictures stay in the bin?", retriever.search("How long do deleted pictures stay in the bin?", 5, false), 150);
  assert.ok(used.reduce((s, c) => s + c.tokens, 0) <= 150 && used.length >= 1);
  assert.ok(prompt.includes("[1] Deleting photos and the trash") && prompt.includes("stay in the trash for 30 days"));
  console.log(`prompt: ${used.length} passages within a 150-token budget, first cited as [1] ${used[0]?.title}`);
}
console.log("all ok");
