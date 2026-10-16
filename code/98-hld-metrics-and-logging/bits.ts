// Writing and reading single bits, for the compressed chunks.
export class BitWriter {
  private bytes = new Uint8Array(256);
  private bit = 0;                      // bits written so far
  write(value: number, n: number): void {   // the low n bits of value, most significant first; n <= 32
    for (let i = n - 1; i >= 0; i -= 1) {
      if (this.bit >> 3 >= this.bytes.length) { const b = new Uint8Array(this.bytes.length * 2); b.set(this.bytes); this.bytes = b; }
      if ((value >>> i) & 1) this.bytes[this.bit >> 3] = (this.bytes[this.bit >> 3] as number) | (0x80 >> (this.bit & 7));
      this.bit += 1;
    }
  }
  get length(): number { return this.bit; }
  finish(): Uint8Array { return this.bytes.slice(0, (this.bit + 7) >> 3); }
}

export class BitReader {
  private readonly bytes: Uint8Array;
  private bit = 0;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i += 1) {
      v = (v * 2) + (((this.bytes[this.bit >> 3] as number) >> (7 - (this.bit & 7))) & 1);
      this.bit += 1;
    }
    return v;
  }
}
