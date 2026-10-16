// A seeded random number generator (sfc32, 128 bits of state). The same seed gives the same sequence,
// so every simulation in this chapter prints the same numbers each time it is run.
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.next32();
  }

  next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  // A number in [0, 1) with 53 random bits, enough to pick uniformly among 62 to the 7th codes.
  float(): number {
    return (this.next32() * 2 ** 21 + (this.next32() >>> 11)) / 2 ** 53;
  }

  // A whole number in [0, n).
  below(n: number): number {
    return Math.floor(this.float() * n);
  }
}
