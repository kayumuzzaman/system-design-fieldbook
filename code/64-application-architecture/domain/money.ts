export type Currency = "EUR" | "USD" | "GBP";

// A value object: no identity, never changes, equal when its contents are equal, valid from the moment it exists.
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
    if (other.currency !== this.currency) throw new Error(`cannot add ${other.currency} to ${this.currency}`);
    return Money.of(this.cents + other.cents, this.currency);
  }
  times(count: number): Money {
    if (!Number.isInteger(count)) throw new Error("multiply money by a whole number");
    return Money.of(this.cents * count, this.currency);
  }
  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }

  // Divides without losing or inventing a cent: the remainder goes to the first shares.
  split(shares: number): Money[] {
    if (!Number.isInteger(shares) || shares < 1) throw new Error("split into at least one share");
    const base = Math.floor(this.cents / shares);
    const extra = this.cents - base * shares;
    return Array.from({ length: shares }, (_, i) => Money.of(base + (i < extra ? 1 : 0), this.currency));
  }

  toString(): string {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }
}
