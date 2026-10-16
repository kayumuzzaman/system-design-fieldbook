// Short codes are numbers written in base 62: ten digits, then 26 capital and 26 small letters.
export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// How many different codes of a given length there are: 62 to the power of the length.
export function spaceOf(length: number): number {
  return 62 ** length;
}

// Writes n in base 62, padded on the left with zeros to the given width.
export function encode(n: number, width = 7): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("n must be a whole number of at least 0");
  let rest = n;
  let code = "";
  do {
    code = ALPHABET[rest % 62] + code;
    rest = Math.floor(rest / 62);
  } while (rest > 0);
  if (code.length > width) throw new Error(`${n} needs more than ${width} characters`);
  return code.padStart(width, "0");
}

export function decode(code: string): number {
  let n = 0;
  for (const ch of code) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`not a base 62 character: ${ch}`);
    n = n * 62 + digit;
  }
  return n;
}
