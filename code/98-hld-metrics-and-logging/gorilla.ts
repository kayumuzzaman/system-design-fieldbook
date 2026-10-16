// A chunk of one time series, compressed the way Facebook's Gorilla does it:
// timestamps as the change in the gap between samples, values as the bits that differ from the last value.
import { BitReader, BitWriter } from "./bits.ts";

const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);   // the 64 bits of a double, as two halves
function bitsOf(v: number): [hi: number, lo: number] { f64[0] = v; return [u32[1] as number, u32[0] as number]; }
function fromBits(hi: number, lo: number): number { u32[1] = hi; u32[0] = lo; return f64[0] as number; }
const ctz = (x: number) => (x === 0 ? 32 : 31 - Math.clz32(x & -x));

export class Chunk {
  private readonly w = new BitWriter();
  private count = 0;
  private t = 0; private gap = 0;                  // last timestamp, last gap
  private hi = 0; private lo = 0;                  // last value's bits
  private lead = -1; private trail = 0;            // the window of meaningful bits used last time
  readonly bitsFor = { time: 0, value: 0 };

  append(t: number, v: number): void {
    const [hi, lo] = bitsOf(v);
    const before = this.w.length;
    if (this.count === 0) {
      this.w.write(Math.floor(t / 2 ** 32), 32); this.w.write(t >>> 0, 32);   // the first timestamp in full
      this.bitsFor.time += 64;
      this.w.write(hi, 32); this.w.write(lo, 32);                             // the first value in full
      this.bitsFor.value += 64;
    } else {
      const gap = t - this.t, dod = gap - this.gap;
      // the change in the gap: usually zero, which costs one bit
      if (dod === 0) this.w.write(0, 1);
      else if (dod >= -63 && dod <= 64) { this.w.write(0b10, 2); this.w.write(dod + 63, 7); }
      else if (dod >= -255 && dod <= 256) { this.w.write(0b110, 3); this.w.write(dod + 255, 9); }
      else if (dod >= -2047 && dod <= 2048) { this.w.write(0b1110, 4); this.w.write(dod + 2047, 12); }
      else { this.w.write(0b1111, 4); this.w.write(dod >>> 0, 32); }
      const mid = this.w.length;
      this.bitsFor.time += mid - before;
      // the value: XOR with the previous one; equal values cost one bit
      const xh = (hi ^ this.hi) >>> 0, xl = (lo ^ this.lo) >>> 0;
      if (xh === 0 && xl === 0) this.w.write(0, 1);
      else {
        this.w.write(1, 1);
        const lead = Math.min(31, xh !== 0 ? Math.clz32(xh) : 32 + Math.clz32(xl));
        const trail = xl !== 0 ? ctz(xl) : 32 + ctz(xh);
        if (this.lead >= 0 && lead >= this.lead && trail >= this.trail) {
          this.w.write(0, 1);                                    // fits in last time's window
          this.writeMeaningful(xh, xl, this.lead, this.trail);
        } else {
          this.w.write(1, 1);
          this.w.write(lead, 5); this.w.write(64 - lead - trail - 1, 6);   // where the meaningful bits are
          this.writeMeaningful(xh, xl, lead, trail);
          this.lead = lead; this.trail = trail;
        }
      }
      this.bitsFor.value += this.w.length - mid;
      this.gap = gap;
    }
    this.t = t; this.hi = hi; this.lo = lo; this.count += 1;
  }

  private writeMeaningful(xh: number, xl: number, lead: number, trail: number): void {
    for (let i = 63 - lead; i >= trail; i -= 1) this.w.write(i >= 32 ? (xh >>> (i - 32)) & 1 : (xl >>> i) & 1, 1);
  }

  samples(): number { return this.count; }
  bytes(): Uint8Array { return this.w.finish(); }

  static decode(bytes: Uint8Array, n: number): [number, number][] {
    const r = new BitReader(bytes), out: [number, number][] = [];
    let t = 0, gap = 0, hi = 0, lo = 0, lead = 0, trail = 0;
    for (let k = 0; k < n; k += 1) {
      if (k === 0) { t = r.read(32) * 2 ** 32 + r.read(32); hi = r.read(32); lo = r.read(32); out.push([t, fromBits(hi, lo)]); continue; }
      let dod = 0;
      if (r.read(1) === 1) {
        if (r.read(1) === 0) dod = r.read(7) - 63;
        else if (r.read(1) === 0) dod = r.read(9) - 255;
        else if (r.read(1) === 0) dod = r.read(12) - 2047;
        else dod = r.read(32) | 0;
      }
      gap += dod; t += gap;
      if (r.read(1) === 1) {
        if (r.read(1) === 1) { lead = r.read(5); trail = 64 - lead - (r.read(6) + 1); }
        let xh = 0, xl = 0;
        for (let i = 63 - lead; i >= trail; i -= 1) {
          if (r.read(1)) { if (i >= 32) xh |= 1 << (i - 32); else xl |= 1 << i; }
        }
        hi = (hi ^ xh) >>> 0; lo = (lo ^ xl) >>> 0;
      }
      out.push([t, fromBits(hi, lo)]);
    }
    return out;
  }
}
