import { hash32 } from "./web.ts";

// A Bloom filter for "have we seen this URL?": never says no to a URL it was given, and says
// yes to a URL it was not given with about the chosen probability, once it holds `expected` URLs.
export class BloomFilter {
  private readonly bits: Uint8Array;
  readonly size: number; // bits
  readonly hashes: number;
  constructor(expected: number, falsePositiveRate: number) {
    this.size = Math.ceil((-expected * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
    this.hashes = Math.max(1, Math.round((this.size / expected) * Math.LN2));
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
  }
  private positions(item: string): number[] {
    const h1 = hash32(item, 0);
    const h2 = (hash32(item, 0x9e3779b9) | 1) >>> 0;
    return Array.from({ length: this.hashes }, (_, i) => (h1 + i * h2) % this.size);
  }
  add(item: string): void {
    for (const p of this.positions(item)) this.bits[p >> 3] = (this.bits[p >> 3] as number) | (1 << (p & 7));
  }
  mightContain(item: string): boolean {
    return this.positions(item).every((p) => ((this.bits[p >> 3] as number) & (1 << (p & 7))) !== 0);
  }
  bytes(): number {
    return this.bits.length;
  }
}
