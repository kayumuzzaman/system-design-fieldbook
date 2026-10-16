import { hash32, seeded } from "./random.ts";

// A rough tokenizer, close enough to count with: a word of up to six letters is one token, a longer word is
// split into pieces of five, and every digit and punctuation mark is a token of its own. A leading space
// belongs to the token that follows it, as in real tokenizers.
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
export const countTokens = (text: string): number => tokenize(text).length;

export interface Usage { inputTokens: number; outputTokens: number }
// temperature 0 means the same prompt always gives the same answer; above 0, `seed` picks one of many answers.
export interface GenerateOptions { maxTokens: number; temperature?: number; seed?: number; signal?: AbortSignal }

// Words of up to six letters, so that each is one token.
const WORDS = ("the photo album share link open menu tap select move copy delete undo trash " +
  "space plan device sync upload save folder people place date edit filter crop rotate").split(" ");

// A stand-in for a language model. It produces text one token at a time, as a real model does, but the text
// is chosen by a seeded random generator: the same prompt at temperature 0 always gives the same answer.
// It counts every token it produces, which is what a provider bills.
export class StubModel {
  readonly name: string;
  produced = 0;
  constructor(name = "stub-1") {
    this.name = name;
  }

  // How long the answer to a prompt would be if nothing stopped it: 40 to 239 tokens.
  naturalLength(prompt: string): number {
    return 40 + (hash32(prompt) % 200);
  }

  async *generate(prompt: string, options: GenerateOptions): AsyncGenerator<string, Usage> {
    const random = seeded(hash32(prompt) ^ (options.temperature ? (options.seed ?? 1) : 0));
    const length = Math.min(options.maxTokens, this.naturalLength(prompt));
    const inputTokens = countTokens(prompt);
    let outputTokens = 0;
    for (; outputTokens < length; ) {
      if (options.signal?.aborted) break; // the caller has gone: stop producing, and stop billing
      await Promise.resolve(); // hand control back, as waiting for the next decode step would
      outputTokens += 1;
      this.produced += 1;
      yield " " + WORDS[Math.floor(random() * WORDS.length)];
    }
    return { inputTokens, outputTokens };
  }
}
