import { Money } from "./money.ts";

export type UserId = string;

// How an expense is divided. It is plain data, because it is stored with the expense and shown again later.
export type Split =
  | { kind: "equal"; among: readonly UserId[] }
  | { kind: "exact"; amounts: Readonly<Record<UserId, number>> }   // cents
  | { kind: "percent"; percents: Readonly<Record<UserId, number>> } // up to two decimal places, adding up to 100
  | { kind: "shares"; shares: Readonly<Record<UserId, number>> };   // whole numbers, such as 2 for a couple

export class SplitError extends Error {}

// Each kind of split, as a function from the total to each person's part. Three of the four are the same
// calculation, allocate, with different weights; only "exact" is checked rather than computed.
export function sharesOf(total: Money, split: Split): Map<UserId, Money> {
  const weighted = (people: readonly UserId[], weights: readonly number[]) => {
    if (people.length === 0) throw new SplitError("a split needs at least one person");
    if (new Set(people).size !== people.length) throw new SplitError("a person appears twice in the split");
    const parts = total.allocate(weights);
    return new Map(people.map((p, i) => [p, parts[i] as Money]));
  };
  switch (split.kind) {
    case "equal":
      return weighted(split.among, split.among.map(() => 1));
    case "shares": {
      const people = Object.keys(split.shares);
      const weights = people.map((p) => split.shares[p] as number);
      if (weights.some((w) => !Number.isInteger(w) || w < 1)) throw new SplitError("shares are whole numbers of at least 1");
      return weighted(people, weights);
    }
    case "percent": {
      const people = Object.keys(split.percents);
      const basisPoints = people.map((p) => Math.round((split.percents[p] as number) * 100));
      if (basisPoints.some((b, i) => b < 0 || Math.abs(b - (split.percents[people[i] as UserId] as number) * 100) > 1e-6)) {
        throw new SplitError("percentages have at most two decimal places and are not negative");
      }
      if (basisPoints.reduce((a, b) => a + b, 0) !== 10_000) throw new SplitError("percentages must add up to 100");
      return weighted(people, basisPoints);
    }
    case "exact": {
      const people = Object.keys(split.amounts);
      const parts = people.map((p) => Money.of(split.amounts[p] as number, total.currency));
      const sum = parts.reduce((a, b) => a.plus(b), Money.zero(total.currency));
      if (!sum.equals(total)) throw new SplitError(`exact amounts add up to ${sum}, not ${total}`);
      if (parts.some((m) => m.cents < 0)) throw new SplitError("an amount cannot be negative");
      return new Map(people.map((p, i) => [p, parts[i] as Money]));
    }
  }
}
