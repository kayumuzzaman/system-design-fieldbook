// Greedy against the fewest transfers on random groups. Used by the tests and by figures.ts.
import { Group } from "./group.ts";
import { fewest, greedy } from "./simplify.ts";
import { seeded } from "./scenario.ts";

// Groups of n people with 2n expenses, each split equally among a random half of the group.
// "round": every share is a whole number of euros from 10 to 80. "any": the amount is any number of cents.
export function compareOn(n: number, amounts: "round" | "any", groups: number, seed: number) {
  const random = seeded(seed);
  let longer = 0, extra = 0, transfers = 0;
  for (let k = 0; k < groups; k += 1) {
    const people = Array.from({ length: n }, (_, i) => `p${i}`);
    const g = new Group("EUR", people);
    for (let e = 0; e < n * 2; e += 1) {
      const among = people.filter(() => random() < 0.5);
      if (among.length === 0) continue;
      const cents = amounts === "round" ? (1 + Math.floor(random() * 8)) * 1000 * among.length : 100 + Math.floor(random() * 20_000);
      g.addExpense({ id: `e${e}`, description: "", paidBy: people[Math.floor(random() * n)] as string, cents, split: { kind: "equal", among } });
    }
    const balances = new Map([...g.balances()].map(([who, m]) => [who, m.cents]));
    const best = fewest(balances).length, quick = greedy(balances).length;
    transfers += best;
    if (quick > best) { longer += 1; extra += quick - best; }
  }
  return { n, amounts, groups, greedyLonger: longer, extraTransfers: extra, averageFewest: Math.round((transfers / groups) * 100) / 100 };
}

// Time for one search for the fewest transfers, with n people whose balances have no zero-sum subgroup to speak of.
export function timeFewest(n: number): number {
  const random = seeded(n);
  const values = Array.from({ length: n - 1 }, () => Math.floor(random() * 2_000_000) - 1_000_000);
  values.push(-values.reduce((a, b) => a + b, 0));
  const start = performance.now();
  fewest(new Map(values.map((v, i) => [`p${i}`, v])));
  return Math.round((performance.now() - start) * 10) / 10;
}
