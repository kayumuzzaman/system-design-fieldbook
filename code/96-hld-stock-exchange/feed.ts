// Market data, order by order. The engine's output becomes three kinds of message, encoded in the
// binary layouts of Nasdaq TotalView-ITCH 5.0 (add 36 bytes, executed 31, delete 19), numbered, and sent
// in packets with a MoldUDP64-style header. A subscriber rebuilds the book and repairs gaps.
import type { Output } from "./engine.ts";
import type { Side } from "./book.ts";

export type L3 =
  | { readonly t: "A"; readonly time: number; readonly order: number; readonly side: Side; readonly qty: number; readonly symbol: string; readonly price: number }
  | { readonly t: "E"; readonly time: number; readonly order: number; readonly qty: number; readonly match: number }
  | { readonly t: "D"; readonly time: number; readonly order: number };

// What the public sees of each engine event: resting orders appear, trade against, and disappear.
export function toMarketData(outputs: readonly Output[], firstMatch = 1): L3[] {
  const md: L3[] = [];
  let match = firstMatch;
  for (const { time, symbol, event: e } of outputs) {
    if (e.type === "rested") md.push({ t: "A", time, order: e.id, side: e.side, qty: e.qty, symbol, price: e.price });
    else if (e.type === "trade") md.push({ t: "E", time, order: e.maker, qty: e.qty, match: match++ });
    else if (e.type === "canceled" && e.why === "requested") md.push({ t: "D", time, order: e.id });
  }
  return md;
}

const SIZE = { A: 36, E: 31, D: 19 } as const;
function put48(v: DataView, at: number, n: number): void { v.setUint16(at, Math.floor(n / 2 ** 32)); v.setUint32(at + 2, n >>> 0); }
function get48(v: DataView, at: number): number { return v.getUint16(at) * 2 ** 32 + v.getUint32(at + 2); }
function put64(v: DataView, at: number, n: number): void { v.setUint32(at, Math.floor(n / 2 ** 32)); v.setUint32(at + 4, n >>> 0); }
function get64(v: DataView, at: number): number { return v.getUint32(at) * 2 ** 32 + v.getUint32(at + 4); }

// Writes one message at byte `at` of a buffer the caller owns, so a busy publisher can reuse one buffer.
export function write(m: L3, v: DataView, at = 0, locate = 1): number {
  v.setUint8(at, m.t.charCodeAt(0));
  v.setUint16(at + 1, locate);       // stock locate: a small number standing for the symbol
  v.setUint16(at + 3, 0);            // tracking number
  put48(v, at + 5, m.time);          // nanoseconds since midnight
  put64(v, at + 11, m.order);
  if (m.t === "A") {
    v.setUint8(at + 19, m.side === "buy" ? 66 : 83);   // "B" or "S"
    v.setUint32(at + 20, m.qty);
    for (let i = 0; i < 8; i += 1) v.setUint8(at + 24 + i, m.symbol.charCodeAt(i) || 32);
    v.setUint32(at + 32, m.price * 100);   // ticks are cents; ITCH prices have four implied decimals
  } else if (m.t === "E") {
    v.setUint32(at + 19, m.qty);
    put64(v, at + 23, m.match);
  }
  return SIZE[m.t];
}

export function read(v: DataView, at = 0): L3 {
  const t = v.getUint8(at), time = get48(v, at + 5), order = get64(v, at + 11);
  if (t === 65) {
    let symbol = "";
    for (let i = 0; i < 8; i += 1) { const c = v.getUint8(at + 24 + i); if (c !== 32) symbol += String.fromCharCode(c); }
    return { t: "A", time, order, side: v.getUint8(at + 19) === 66 ? "buy" : "sell", qty: v.getUint32(at + 20), symbol, price: v.getUint32(at + 32) / 100 };
  }
  if (t === 69) return { t: "E", time, order, qty: v.getUint32(at + 19), match: get64(v, at + 23) };
  return { t: "D", time, order };
}

export function encode(m: L3): Uint8Array {
  const b = new Uint8Array(SIZE[m.t]);
  write(m, new DataView(b.buffer));
  return b;
}
export function decode(b: Uint8Array): L3 { return read(new DataView(b.buffer, b.byteOffset, b.byteLength)); }

// The same message as JSON, for comparison.
export function asJson(m: L3): string { return JSON.stringify(m.t === "A" ? { ...m, price: (m.price / 100).toFixed(2) } : m); }

// --- packets: a 20-byte header (session 10, first sequence number 8, message count 2), then each message with a 2-byte length
export interface Packet { readonly first: number; readonly bytes: Uint8Array }

export function packets(messages: readonly Uint8Array[], firstSeq: number, maxPayload = 1400): Packet[] {
  const out: Packet[] = [];
  let i = 0;
  while (i < messages.length) {
    let size = 20, n = 0;
    while (i + n < messages.length && size + 2 + (messages[i + n] as Uint8Array).length <= maxPayload) { size += 2 + (messages[i + n] as Uint8Array).length; n += 1; }
    const b = new Uint8Array(size), v = new DataView(b.buffer);
    for (let k = 0; k < 10; k += 1) b[k] = "SESSION001".charCodeAt(k);
    put64(v, 10, firstSeq + i);
    v.setUint16(18, n);
    let at = 20;
    for (let k = 0; k < n; k += 1) { const m = messages[i + k] as Uint8Array; v.setUint16(at, m.length); b.set(m, at + 2); at += 2 + m.length; }
    out.push({ first: firstSeq + i, bytes: b });
    i += n;
  }
  return out;
}

function unpack(b: Uint8Array): { first: number; messages: Uint8Array[] } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const first = get64(v, 10), n = v.getUint16(18);
  const messages: Uint8Array[] = [];
  let at = 20;
  for (let k = 0; k < n; k += 1) { const len = v.getUint16(at); messages.push(b.subarray(at + 2, at + 2 + len)); at += 2 + len; }
  return { first, messages };
}

// The retransmission server keeps every message by sequence number and answers requests for a range.
export class Rerequest {
  private readonly all: Uint8Array[] = [];   // index 0 is sequence number 1
  requests = 0;
  record(messages: readonly Uint8Array[]): void { this.all.push(...messages); }
  ask(first: number, count: number): Packet[] { this.requests += 1; return packets(this.all.slice(first - 1, first - 1 + count), first); }
}

// A subscriber applies messages strictly in sequence. A packet from the future means a gap: keep it,
// ask for what is missing, and apply everything in order once the gap is filled.
export class Subscriber {
  private expected = 1;
  private readonly early = new Map<number, Uint8Array[]>();
  readonly orders = new Map<number, { side: Side; price: number; qty: number }>();
  gaps = 0;
  private readonly server: Rerequest;
  constructor(server: Rerequest) { this.server = server; }

  receive(p: Packet): void {
    const { first, messages } = unpack(p.bytes);
    if (first > this.expected) {
      this.early.set(first, messages);
      this.gaps += 1;
      for (const r of this.server.ask(this.expected, first - this.expected)) this.receive(r);
      return;
    }
    messages.forEach((m, k) => { if (first + k === this.expected) { this.apply(decode(m)); this.expected += 1; } });
    for (let next = this.early.get(this.expected); next; next = this.early.get(this.expected)) {
      this.early.delete(this.expected);
      for (const m of next) { this.apply(decode(m)); this.expected += 1; }
    }
  }
  // a quiet feed still sends heartbeats carrying the next sequence number, so a lost last packet is noticed too
  heartbeat(next: number): void { if (next > this.expected) for (const r of this.server.ask(this.expected, next - this.expected)) this.receive(r); }
  next(): number { return this.expected; }

  private apply(m: L3): void {
    if (m.t === "A") this.orders.set(m.order, { side: m.side, price: m.price, qty: m.qty });
    else if (m.t === "E") {
      const o = this.orders.get(m.order);
      if (!o) throw new Error(`execution for unknown order ${m.order}`);
      o.qty -= m.qty;
      if (o.qty === 0) this.orders.delete(m.order);
    } else this.orders.delete(m.order);
  }

  // Depth by price (level 2), built from the order-by-order view (level 3).
  depth(side: Side): [number, number, number][] {
    const m = new Map<number, [number, number]>();
    for (const o of this.orders.values()) if (o.side === side) { const v = m.get(o.price) ?? [0, 0]; m.set(o.price, [v[0] + o.qty, v[1] + 1]); }
    return [...m].sort((a, b) => (side === "buy" ? b[0] - a[0] : a[0] - b[0])).map(([p, [q, n]]) => [p, q, n]);
  }
}
