import { createHash } from "node:crypto";
import { encode, spaceOf } from "./base62.ts";
import type { Rng } from "./rng.ts";

// Where codes are stored. insertIfAbsent is one atomic operation: an INSERT that a unique constraint
// on the code can reject, or a conditional put in a key-value store.
export interface CodeTable {
  insertIfAbsent(code: string, longUrl: string): boolean;
  get(code: string): string | undefined;
}

// 1. Random codes: draw one, try to insert it, draw again if it is taken.
export function createRandom(table: CodeTable, longUrl: string, rng: Rng, length = 7, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = encode(rng.below(spaceOf(length)), length);
    if (table.insertIfAbsent(code, longUrl)) return { code, attempts: attempt };
  }
  throw new Error(`no free code after ${maxAttempts} attempts: the code space is too full`);
}

// 2. A hash of the URL, cut down to the code space. The same URL always gives the same code,
// unless a different URL got there first; then the URL is hashed again with a counter appended.
export function hashCode(longUrl: string, attempt: number, length = 7): string {
  const input = attempt === 0 ? longUrl : `${longUrl}#${attempt}`;
  const digest = createHash("sha256").update(input).digest();
  return encode(digest.readUIntBE(0, 6) % spaceOf(length), length); // the first 48 bits
}

export function createHashed(table: CodeTable, longUrl: string, length = 7, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = hashCode(longUrl, attempt, length);
    if (table.insertIfAbsent(code, longUrl)) return { code, attempts: attempt + 1, reused: false };
    if (table.get(code) === longUrl) return { code, attempts: attempt + 1, reused: true }; // shortened before
  }
  throw new Error(`no free code after ${maxAttempts} attempts`);
}

// 3. A counter, handed out in ranges. The coordinator is the only shared state, and it is asked once
// for each range, not once for each link. In production it is one row updated atomically
// (UPDATE counter SET next = next + size RETURNING next) or a counter in a coordination service.
export class RangeCoordinator {
  readonly size: number;
  leases = 0;
  private next = 0;

  constructor(size: number) {
    this.size = size;
  }

  lease(): { start: number; end: number } {
    const start = this.next;
    this.next += this.size;
    this.leases++;
    return { start, end: this.next };
  }
}

export class CodeServer {
  private readonly coordinator: RangeCoordinator;
  private readonly scrambler: Scrambler | null;
  private nextValue = 0;
  private end = 0; // exclusive: the server starts with an empty range

  constructor(coordinator: RangeCoordinator, scrambler: Scrambler | null = null) {
    this.coordinator = coordinator;
    this.scrambler = scrambler;
  }

  // The next counter value. Nothing shared is touched until the range runs out.
  nextNumber(): number {
    if (this.nextValue === this.end) {
      const range = this.coordinator.lease();
      this.nextValue = range.start;
      this.end = range.end;
    }
    return this.nextValue++;
  }

  nextCode(length = 7): string {
    const n = this.nextNumber();
    return encode(this.scrambler ? this.scrambler.permute(n) : n, length);
  }

  // A restart loses what was left of the range. Those values are never issued, which wastes them
  // but can never cause a duplicate.
  restart(): number {
    const lost = this.end - this.nextValue;
    this.nextValue = 0;
    this.end = 0;
    return lost;
  }
}

// A keyed shuffle of 0 .. space - 1. Each counter value maps to a different number in the same range,
// so codes stay unique, but neighbors land far apart and nobody can count through the links.
// It is a Feistel network: split the bits into two halves, and in each round mix one half into the
// other through a function of a secret key. Every round can be undone, so the whole is a permutation
// of all 2^bits values. A result at or above space is shuffled again until it falls inside.
export class Scrambler {
  readonly space: number;
  private readonly half: number; // bits in each half
  private readonly keys: readonly number[];

  constructor(space: number, keys: readonly number[]) {
    this.space = space;
    this.half = Math.ceil(Math.ceil(Math.log2(space)) / 2);
    this.keys = keys;
  }

  permute(n: number): number {
    if (!Number.isSafeInteger(n) || n < 0 || n >= this.space) throw new Error("n is outside the space");
    let x = n;
    do x = this.feistel(x);
    while (x >= this.space);
    return x;
  }

  private feistel(x: number): number {
    const size = 2 ** this.half;
    let left = Math.floor(x / size);
    let right = x % size;
    for (const key of this.keys) {
      const mixed = (left ^ mix(right, key)) & (size - 1);
      left = right;
      right = mixed;
    }
    return left * size + right;
  }
}

// A small integer hash (the finalizer of MurmurHash3). Not a cipher: see the text.
function mix(value: number, key: number): number {
  let h = (value ^ key) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
