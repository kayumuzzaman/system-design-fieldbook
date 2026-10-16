import { Group } from "./group.ts";

// A small seeded generator, so that every run sees the same "random" data.
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// A weekend away: four friends, and one expense of each kind of split.
export function trip(): Group {
  const g = new Group("EUR", ["ana", "ben", "chloe", "dev"]);
  g.addExpense({ id: "e1", description: "hotel", paidBy: "ana", cents: 36_000, split: { kind: "equal", among: ["ana", "ben", "chloe", "dev"] } });
  g.addExpense({ id: "e2", description: "dinner", paidBy: "ben", cents: 8_550, split: { kind: "shares", shares: { ana: 1, ben: 1, chloe: 2 } } });
  g.addExpense({ id: "e3", description: "taxi", paidBy: "chloe", cents: 4_200, split: { kind: "percent", percents: { ana: 25, dev: 75 } } });
  g.addExpense({ id: "e4", description: "groceries", paidBy: "dev", cents: 6_137, split: { kind: "exact", amounts: { ana: 1_500, ben: 2_000, dev: 2_637 } } });
  return g;
}
