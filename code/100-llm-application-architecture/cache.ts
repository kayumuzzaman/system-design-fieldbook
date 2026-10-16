import { createHash } from "node:crypto";

export interface ModelRequest {
  model: string;
  temperature: number;
  maxTokens: number;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

// Differences that do not change the meaning of a question: case, and spaces at the ends or in a row.
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// The key is a hash of everything that affects the answer: the model, its settings and the whole prompt.
// Leaving any of these out would return an answer produced for a different request.
export function cacheKey(request: ModelRequest, normalizeText = true): string {
  const text = (t: string) => (normalizeText ? normalize(t) : t);
  const canonical = JSON.stringify([request.model, request.temperature, request.maxTokens, text(request.system),
    request.messages.map((m) => [m.role, text(m.content)])]);
  return createHash("sha256").update(canonical).digest("hex");
}

// An exact-match cache of whole responses, least recently used first out, with an expiry.
// Only requests at temperature 0 are cached: above it, the caller asked for a fresh answer each time.
export class ResponseCache {
  private readonly entries = new Map<string, { text: string; expires: number }>();
  hits = 0;
  misses = 0;
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly normalizeText: boolean;
  constructor(capacity: number, ttlMs: number, normalizeText = true) {
    this.capacity = capacity; this.ttlMs = ttlMs; this.normalizeText = normalizeText;
  }
  get(request: ModelRequest, now: number): string | undefined {
    if (request.temperature !== 0) return undefined;
    const key = cacheKey(request, this.normalizeText);
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      this.misses += 1;
      return undefined;
    }
    this.entries.delete(key);   // move to the most recently used end
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.text;
  }
  put(request: ModelRequest, text: string, now: number): void {
    if (request.temperature !== 0) return;
    const key = cacheKey(request, this.normalizeText);
    this.entries.delete(key);
    this.entries.set(key, { text, expires: now + this.ttlMs });
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value as string);
  }
  get hitRatio(): number { return this.hits / (this.hits + this.misses); }
}

// --- A semantic cache: reuse the answer to an earlier question whose embedding is close enough.

// A stand-in for an embedding model: words, minus the commonest, with a few synonyms folded together, hashed
// into 1,024 numbers and scaled to length 1. A learned model captures far more meaning; this one is enough to
// show how the threshold behaves.
const STOP = new Set("a an the i my me to do how can is are what of for in on with from it and or be does".split(" "));
const SAME: Record<string, string> = { remove: "delete", erase: "delete", picture: "photo", pictures: "photo", photos: "photo",
  recover: "restore", back: "restore", unshare: "stopshare", subscription: "plan", space: "storage", buy: "upgrade",
  bigger: "upgrade", more: "upgrade", originals: "original", syncing: "sync", send: "share", full: "storage" };
export function embed(text: string): Float64Array {
  const v = new Float64Array(1024);
  for (const raw of normalize(text).replace(/[^a-z ]/g, " ").split(" ")) {
    if (!raw || STOP.has(raw)) continue;
    const word = SAME[raw] ?? raw;
    let h = 2166136261;
    for (let i = 0; i < word.length; i += 1) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
    v[(h >>> 0) % 1024] += 1;
  }
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}
export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] as number) * (b[i] as number);
  return dot;
}

export class SemanticCache<T> {
  private readonly entries: { vector: Float64Array; value: T }[] = [];
  private readonly threshold: number;
  constructor(threshold: number) { this.threshold = threshold; }
  // The stored answer of the most similar earlier question, if it is at least `threshold` similar.
  get(question: string): T | undefined {
    const q = embed(question);
    let best: T | undefined, bestScore = -1;
    for (const e of this.entries) {
      const score = cosine(q, e.vector);
      if (score > bestScore) { bestScore = score; best = e.value; }
    }
    return bestScore >= this.threshold ? best : undefined;
  }
  put(question: string, value: T): void { this.entries.push({ vector: embed(question), value }); }
}
