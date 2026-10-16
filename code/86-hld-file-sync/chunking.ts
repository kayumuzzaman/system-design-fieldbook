import { createHash } from "node:crypto";

export type Chunk = { readonly offset: number; readonly length: number; readonly hash: string };

// A chunker decides where one chunk ends and the next begins.
export interface Chunker {
  readonly name: string;
  ends(data: Uint8Array): number[]; // the end offset of every chunk, in order
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Splits data into chunks and names each one by the hash of its bytes.
export function chunk(data: Uint8Array, chunker: Chunker): Chunk[] {
  const out: Chunk[] = [];
  let start = 0;
  for (const end of chunker.ends(data)) {
    out.push({ offset: start, length: end - start, hash: sha256(data.subarray(start, end)) });
    start = end;
  }
  return out;
}

// Fixed-size chunks: a boundary every `size` bytes, wherever it falls in the content.
export class FixedChunker implements Chunker {
  readonly name: string;
  private readonly size: number;
  constructor(size: number) {
    this.size = size;
    this.name = `fixed ${size}`;
  }
  ends(data: Uint8Array): number[] {
    const out: number[] = [];
    for (let end = this.size; end < data.length; end += this.size) out.push(end);
    if (data.length > 0) out.push(data.length);
    return out;
  }
}

// A table of 256 seeded random 32-bit numbers, one for each byte value.
function gearTable(seed: number): Uint32Array {
  const t = new Uint32Array(256);
  let s = seed >>> 0;
  for (let i = 0; i < 256; i += 1) {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    s = (Math.imul(s ^ (s >>> 12), 0x297a2d39) + i) >>> 0;
    t[i] = s;
  }
  return t;
}

// Content-defined chunks: a boundary wherever a rolling hash of the last 32 bytes is small
// enough. The boundaries depend on the content near them, not on their distance from the start,
// so an insertion moves only the boundaries next to it.
export class ContentDefinedChunker implements Chunker {
  readonly name: string;
  private readonly min: number;
  private readonly max: number;
  private readonly threshold: number; // a hash below this ends a chunk
  private readonly gear: Uint32Array;
  constructor(average: number, seed = 86) {
    this.min = Math.floor(average / 4);
    this.max = average * 4;
    // After the minimum, each byte ends the chunk with probability 1 / (average − min).
    this.threshold = Math.floor(2 ** 32 / (average - this.min));
    this.gear = gearTable(seed);
    this.name = `content-defined ${average}`;
  }
  ends(data: Uint8Array): number[] {
    const out: number[] = [];
    const gear = this.gear;
    let start = 0;
    while (start < data.length) {
      const limit = Math.min(start + this.max, data.length);
      let end = limit;
      let h = 0;
      for (let i = start; i < limit; i += 1) {
        h = ((h << 1) + (gear[data[i] as number] as number)) >>> 0; // the oldest byte shifts out after 32 steps
        if (i + 1 - start >= this.min && h < this.threshold) {
          end = i + 1;
          break;
        }
      }
      out.push(end);
      start = end;
    }
    return out;
  }
}
