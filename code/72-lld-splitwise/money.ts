export type Currency = "EUR" | "USD" | "GBP";

// The value object from the chapter on domain modeling, with what expense sharing adds:
// subtraction, signs, and dividing in proportion to weights without losing a cent.
export class Money {
  readonly cents: number;
  readonly currency: Currency;

  private constructor(cents: number, currency: Currency) {
    this.cents = cents;
    this.currency = currency;
    Object.freeze(this);
  }

  static of(cents: number, currency: Currency): Money {
    if (!Number.isSafeInteger(cents)) throw new Error(`money is a whole number of cents, got ${cents}`);
    return new Money(cents, currency);
  }
  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  plus(other: Money): Money {
    this.sameCurrency(other);
    return Money.of(this.cents + other.cents, this.currency);
  }
  minus(other: Money): Money {
    this.sameCurrency(other);
    return Money.of(this.cents - other.cents, this.currency);
  }
  negate(): Money {
    return Money.of(-this.cents, this.currency);
  }
  isZero(): boolean {
    return this.cents === 0;
  }
  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }

  // Divides in proportion to whole-number weights. Each part gets the whole cents of its exact share, and the cents
  // left over go one each to the parts with the largest fractions; ties go to the earlier part.
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error("weights are whole numbers, at least one");
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) throw new Error("weights must not all be zero");
    if (!Number.isSafeInteger(Math.abs(this.cents) * total)) throw new Error("amount too large to divide exactly");
    const sign = this.cents < 0 ? -1 : 1;
    const cents = Math.abs(this.cents);
    const rests = weights.map((w) => (cents * w) % total);             // each fraction left over, times total
    const parts = weights.map((w, i) => (cents * w - (rests[i] as number)) / total); // whole cents, exactly
    const order = rests.map((rest, i) => ({ i, rest })).sort((a, b) => b.rest - a.rest || a.i - b.i);
    let left = cents - parts.reduce((a, b) => a + b, 0);
    for (const { i } of order) {
      if (left === 0) break;
      parts[i] = (parts[i] as number) + 1;
      left -= 1;
    }
    return parts.map((p) => Money.of(sign * p, this.currency));
  }

  toString(): string {
    const sign = this.cents < 0 ? "-" : "";
    return `${sign}${(Math.abs(this.cents) / 100).toFixed(2)} ${this.currency}`;
  }

  private sameCurrency(other: Money): void {
    if (other.currency !== this.currency) throw new Error(`cannot combine ${other.currency} with ${this.currency}`);
  }
}
