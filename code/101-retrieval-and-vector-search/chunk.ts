import { tokenize } from "./text.ts";
import type { Article } from "./corpus.ts";

export interface Chunk { article: string; title: string; text: string; tokens: number }

// Fixed-size windows of `size` tokens, each starting `size - overlap` tokens after the last. Cuts fall
// wherever the count says, in the middle of a sentence if need be.
export function fixedChunks(a: Article, size: number, overlap = 0): Chunk[] {
  const t = tokenize(a.body);
  const out: Chunk[] = [];
  for (let start = 0; start < t.length; start += size - overlap) {
    const piece = t.slice(start, start + size);
    out.push({ article: a.id, title: a.title, text: piece.join("").trim(), tokens: piece.length });
    if (start + size >= t.length) break;
  }
  return out;
}
// One chunk for each paragraph: the cuts follow the author's structure.
export function paragraphChunks(a: Article): Chunk[] {
  return a.body.split(/\n\s*\n/).map((p) => ({ article: a.id, title: a.title, text: p.trim(), tokens: tokenize(p).length }));
}
export function wholeArticle(a: Article): Chunk[] {
  return [{ article: a.id, title: a.title, text: a.body, tokens: tokenize(a.body).length }];
}
// What is indexed for a chunk: optionally with the title of its article in front, so that a chunk that
// says "it" or "this setting" still carries what it is about.
export const indexedText = (c: Chunk, withTitle: boolean): string => (withTitle ? `${c.title}. ${c.text}` : c.text);

// A chunk answers a question if it contains the whole answer passage (spacing aside).
const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
export const contains = (c: Chunk, answer: string): boolean => flat(c.text).includes(flat(answer));
