import { hash32 } from "./web.ts";

// SimHash: a 64-bit fingerprint, kept as two 32-bit halves, in which documents that share most
// of their word triples differ in only a few bits.
export function simhash(words: readonly string[]): [number, number] {
  const votes = new Int32Array(64);
  for (let i = 0; i + 2 < words.length; i += 1) {
    const shingle = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    const halves = [hash32(shingle, 1), hash32(shingle, 2)];
    for (let b = 0; b < 64; b += 1) {
      const bit = ((halves[b >> 5] as number) >>> (b & 31)) & 1;
      votes[b] = (votes[b] as number) + (bit ? 1 : -1);
    }
  }
  let lo = 0, hi = 0;
  for (let b = 0; b < 32; b += 1) if ((votes[b] as number) > 0) lo |= 1 << b;
  for (let b = 0; b < 32; b += 1) if ((votes[b + 32] as number) > 0) hi |= 1 << b;
  return [lo >>> 0, hi >>> 0];
}

const popcount = (x: number) => {
  let n = 0;
  for (let v = x >>> 0; v !== 0; v &= v - 1) n += 1;
  return n;
};
export function distance(a: [number, number], b: [number, number]): number {
  return popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);
}
