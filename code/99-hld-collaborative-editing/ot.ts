// Operational transformation for plain text. An operation walks the whole document:
// a positive number keeps that many characters, a string inserts it, a negative number deletes that many.
export type Part = number | string;
export type Op = Part[];

function push(op: Op, p: Part): void {
  if (p === 0 || p === "") return;
  const last = op[op.length - 1];
  if (typeof p === "string" && typeof last === "string") op[op.length - 1] = last + p;
  else if (typeof p === "number" && typeof last === "number" && (p > 0) === (last > 0)) op[op.length - 1] = last + p;
  else op.push(p);
}

export function make(parts: Part[]): Op { const op: Op = []; for (const p of parts) push(op, p); return op; }
export const insertAt = (len: number, pos: number, text: string): Op => make([pos, text, len - pos]);
export const deleteAt = (len: number, pos: number, n: number): Op => make([pos, -n, len - pos - n]);

export function apply(doc: string, op: Op): string {
  let out = "", i = 0;
  for (const p of op) {
    if (typeof p === "string") out += p;
    else if (p > 0) { out += doc.slice(i, i + p); i += p; }
    else i -= p;
  }
  if (i !== doc.length) throw new Error(`operation covers ${i} characters, document has ${doc.length}`);
  return out;
}

// Given a and b made on the same document, returns [a', b'] such that
// apply(apply(doc, a), b') === apply(apply(doc, b), a'). When both insert at the same place, a's text goes first.
export function transform(a: Op, b: Op): [Op, Op] {
  const a2: Op = [], b2: Op = [];
  let i = 0, j = 0;
  let x: Part | undefined = a[0], y: Part | undefined = b[0];
  const nextA = () => { i += 1; x = a[i]; }, nextB = () => { j += 1; y = b[j]; };
  while (x !== undefined || y !== undefined) {
    if (typeof x === "string") { push(a2, x); push(b2, x.length); nextA(); continue; }   // a inserts: b keeps it
    if (typeof y === "string") { push(a2, y.length); push(b2, y); nextB(); continue; }   // b inserts: a keeps it
    if (x === undefined || y === undefined) throw new Error("operations of different lengths");
    if (x > 0 && y > 0) {                       // both keep
      const n = Math.min(x, y); push(a2, n); push(b2, n);
      x -= n; y -= n; if (x === 0) nextA(); if (y === 0) nextB();
    } else if (x < 0 && y < 0) {                // both delete the same characters: nothing left to do
      const n = Math.min(-x, -y);
      x += n; y += n; if (x === 0) nextA(); if (y === 0) nextB();
    } else if (x < 0) {                         // a deletes what b keeps
      const n = Math.min(-x, y as number); push(a2, -n);
      x += n; y = (y as number) - n; if (x === 0) nextA(); if (y === 0) nextB();
    } else {                                    // b deletes what a keeps
      const n = Math.min(x, -(y as number)); push(b2, -n);
      x -= n; y = (y as number) + n; if (x === 0) nextA(); if (y === 0) nextB();
    }
  }
  return [a2, b2];
}

// One operation that has the effect of a followed by b.
export function compose(a: Op, b: Op): Op {
  const out: Op = [];
  let i = 0, j = 0;
  let x: Part | undefined = a[0], y: Part | undefined = b[0];
  const nextA = () => { i += 1; x = a[i]; }, nextB = () => { j += 1; y = b[j]; };
  while (x !== undefined || y !== undefined) {
    if (typeof x === "number" && x < 0) { push(out, x); nextA(); continue; }        // deleted by a: b never saw it
    if (typeof y === "string") { push(out, y); nextB(); continue; }                   // inserted by b
    if (x === undefined || y === undefined) throw new Error("operations do not chain");
    if (typeof x === "string") {
      const n = Math.min(x.length, Math.abs(y as number));
      if ((y as number) > 0) push(out, x.slice(0, n));       // b keeps a's insert
      x = x.slice(n); y = (y as number) > 0 ? (y as number) - n : (y as number) + n;
      if (x === "") nextA(); if (y === 0) nextB();
    } else {
      const n = Math.min(x, Math.abs(y as number));
      push(out, (y as number) > 0 ? n : -n);
      x -= n; y = (y as number) > 0 ? (y as number) - n : (y as number) + n;
      if (x === 0) nextA(); if (y === 0) nextB();
    }
  }
  return out;
}
