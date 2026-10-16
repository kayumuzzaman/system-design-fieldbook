// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { Group } from "./group.ts";
import { Money } from "./money.ts";
import { trip } from "./scenario.ts";
import { fewest, greedy } from "./simplify.ts";
import { compareOn, timeFewest } from "./compare.ts";

const cents = (m: Map<string, Money>) => Object.fromEntries([...m].map(([k, v]) => [k, v.cents]));
// the trip, one expense at a time
const steps = [];
const full = trip();
const g = new Group("EUR", ["ana", "ben", "chloe", "dev"]);
for (const x of full.expenses()) {
  g.addExpense({ id: x.id, description: x.description, paidBy: x.paidBy, cents: x.amount.cents, split: x.split });
  steps.push({ id: x.id, description: x.description, paidBy: x.paidBy, amount: x.amount.cents, kind: x.split.kind, shares: cents(new Map(x.shares)), balances: cents(g.balances()) });
}
const balances = new Map(Object.entries(cents(full.balances())));
const pairwise = full.pairwise().map((d) => ({ from: d.from, to: d.to, cents: d.amount.cents }));
const counter = new Map([["ana", 3000], ["ben", 2000], ["chloe", 2000], ["dev", -4000], ["eve", -3000]]);
const comparison = [4, 6, 8, 10, 12].flatMap((n) => [compareOn(n, "round", 2000, n), compareOn(n, "any", 2000, 100 + n)]);
const timing = Object.fromEntries([10, 14, 16, 18, 20].map((n) => [n, timeFewest(n)]));
console.log(JSON.stringify({ steps, pairwise, plan: greedy(balances), counter: { greedy: greedy(counter), fewest: fewest(counter) }, comparison, timing }));
