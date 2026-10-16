// Two ways to store logs. Index every word, as a search engine does; or index only a few labels
// (service, level) and keep the lines in compressed chunks that a query decompresses and scans.
import { gzipSync, gunzipSync } from "node:zlib";
import { pick } from "./rng.ts";

const services = ["api", "auth", "billing", "cart", "catalog", "checkout", "feed", "media", "notify", "search", "shipping", "users"];
const routes = ["GET /v1/items", "GET /v1/items/:id", "POST /v1/orders", "GET /v1/feed", "POST /v1/login", "GET /v1/search", "PUT /v1/cart", "GET /v1/users/:id"];
const messages = ["request served", "cache miss, loading from database", "retrying call to downstream", "slow query", "payment declined by issuer", "token expired", "rate limit reached", "upstream timed out"];

export interface Line { readonly service: string; readonly level: string; readonly text: string }

export function logLines(random: () => number, n: number, start = Date.UTC(2026, 9, 13, 12)): Line[] {
  const out: Line[] = [];
  const hex = () => Math.floor(random() * 2 ** 32).toString(16).padStart(8, "0");
  for (let i = 0; i < n; i += 1) {
    const r = random();
    const level = r < 0.9 ? "info" : r < 0.97 ? "warn" : "error";
    const service = pick(random, services);
    const status = level === "error" ? 500 : level === "warn" ? 429 : 200;
    const text = JSON.stringify({
      time: new Date(start + i * 7).toISOString(), level, service, route: pick(random, routes), status,
      duration_ms: Math.round(5 + -Math.log(1 - random()) * 40), trace_id: hex() + hex() + hex() + hex(),
      user: `u-${Math.floor(random() * 100_000)}`, msg: pick(random, messages),
    });
    out.push({ service, level, text });
  }
  return out;
}

export interface Store { readonly rawBytes: number; readonly chunkBytes: number; readonly chunks: { stream: string; first: number; data: Uint8Array }[] }

// Lines grouped by stream (service and level), cut into chunks of about 256 KB, each compressed.
export function chunked(lines: readonly Line[], target = 256 * 1024): Store {
  const open = new Map<string, { first: number; parts: string[]; size: number }>();
  const chunks: { stream: string; first: number; data: Uint8Array }[] = [];
  let rawBytes = 0;
  const cut = (stream: string) => {
    const o = open.get(stream);
    if (!o) return;
    chunks.push({ stream, first: o.first, data: gzipSync(o.parts.join("\n")) });
    open.delete(stream);
  };
  lines.forEach((l, i) => {
    const stream = `${l.service}/${l.level}`;
    const o = open.get(stream) ?? { first: i, parts: [], size: 0 };
    o.parts.push(l.text); o.size += l.text.length + 1; rawBytes += l.text.length + 1;
    open.set(stream, o);
    if (o.size >= target) cut(stream);
  });
  for (const s of [...open.keys()]) cut(s);
  return { rawBytes, chunkBytes: chunks.reduce((a, c) => a + c.data.length, 0), chunks };
}

// A full-text index: every token, with the lines that contain it, stored as variable-length gaps.
export function fullIndexBytes(lines: readonly Line[]): { terms: number; bytes: number; postings: Map<string, number[]> } {
  const postings = new Map<string, number[]>();
  lines.forEach((l, i) => {
    for (const tok of new Set(l.text.toLowerCase().split(/[^a-z0-9_.:-]+/))) {
      if (!tok) continue;
      const p = postings.get(tok);
      if (p) p.push(i); else postings.set(tok, [i]);
    }
  });
  let bytes = 0;
  for (const [tok, ids] of postings) {
    bytes += tok.length + 4;                      // the term in the dictionary, with a pointer
    let prev = -1;
    for (const id of ids) { let gap = id - prev; prev = id; do { bytes += 1; gap = Math.floor(gap / 128); } while (gap > 0); }
  }
  return { terms: postings.size, bytes, postings };
}

// The label index: one entry per chunk naming its stream and where it is.
export function labelIndexBytes(store: Store): number {
  return store.chunks.reduce((a, c) => a + c.stream.length + 8 + 8 + 40, 0);   // stream, first line, time range, object key
}

// Find the lines of one service that contain a string, by scanning its chunks.
export function scan(store: Store, service: string, needle: string): { lines: string[]; bytesRead: number } {
  const lines: string[] = [];
  let bytesRead = 0;
  for (const c of store.chunks) {
    if (!c.stream.startsWith(service + "/")) continue;
    const text = gunzipSync(c.data).toString();
    bytesRead += text.length;
    for (const line of text.split("\n")) if (line.includes(needle)) lines.push(line);
  }
  return { lines, bytesRead };
}
