import assert from "node:assert/strict";
import { Money } from "./money.ts";
import { sharesOf, SplitError, type Split } from "./split.ts";
import { Group } from "./group.ts";
import { apply, fewest, greedy, type Transfer } from "./simplify.ts";
import { seeded, trip } from "./scenario.ts";
import { compareOn } from "./compare.ts";

const eur = (cents: number) => Money.of(cents, "EUR");
const cents = (m: Map<string, Money>) => Object.fromEntries([...m].map(([k, v]) => [k, v.cents]));

// --- allocate: proportional parts that always add up
assert.deepEqual(eur(1000).allocate([1, 1, 1]).map((m) => m.cents), [334, 333, 333]);
assert.deepEqual(eur(10_001).allocate([5000, 3000, 2000]).map((m) => m.cents), [5001, 3000, 2000]); // 5000.5, 3000.3, 2000.2
assert.deepEqual(eur(100).allocate([1, 2]).map((m) => m.cents), [33, 67]);   // 33.3 and 66.7: the larger fraction gets the cent
assert.deepEqual(eur(-1000).allocate([1, 1, 1]).map((m) => m.cents), [-334, -333, -333]);
assert.deepEqual(eur(500).allocate([0, 1]).map((m) => m.cents), [0, 500]);
// one cent more in total can mean one cent less for someone: 10 -> 2, 4, 4 but 11 -> 1, 5, 5 (the "Alabama paradox")
assert.deepEqual(eur(10).allocate([1, 3, 3]).map((m) => m.cents), [2, 4, 4]);
assert.deepEqual(eur(11).allocate([1, 3, 3]).map((m) => m.cents), [1, 5, 5]);
assert.throws(() => eur(100).allocate([]), /at least one/);
assert.throws(() => eur(100).allocate([0, 0]), /not all be zero/);
{
  // 10,000 random divisions: the parts add up, and each is within one cent of its exact share
  const random = seeded(1);
  let naiveWrong = 0;
  for (let i = 0; i < 10_000; i += 1) {
    const total = 1 + Math.floor(random() * 1_000_000);
    const weights = Array.from({ length: 2 + Math.floor(random() * 6) }, () => 1 + Math.floor(random() * 10));
    const sum = weights.reduce((a, b) => a + b, 0);
    const parts = eur(total).allocate(weights).map((m) => m.cents);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    parts.forEach((p, j) => assert.ok(Math.abs(p - (total * (weights[j] as number)) / sum) < 1));
    const naive = weights.map((w) => Math.round((total * w) / sum)); // round each part on its own
    if (naive.reduce((a, b) => a + b, 0) !== total) naiveWrong += 1;
  }
  console.log(`rounding each part on its own: the parts missed the total in ${naiveWrong} of 10,000 divisions`);
  assert.ok(naiveWrong > 3000);
}

// --- the four kinds of split
const t = eur(8550);
assert.deepEqual(cents(sharesOf(t, { kind: "equal", among: ["ana", "ben", "chloe"] })), { ana: 2850, ben: 2850, chloe: 2850 });
assert.deepEqual(cents(sharesOf(t, { kind: "shares", shares: { ana: 1, ben: 1, chloe: 2 } })), { ana: 2138, ben: 2137, chloe: 4275 });
assert.deepEqual(cents(sharesOf(t, { kind: "percent", percents: { ana: 33.33, ben: 33.33, chloe: 33.34 } })), { ana: 2850, ben: 2850, chloe: 2850 });
assert.deepEqual(cents(sharesOf(t, { kind: "exact", amounts: { ana: 1000, ben: 2550, chloe: 5000 } })), { ana: 1000, ben: 2550, chloe: 5000 });
const refused: Split[] = [
  { kind: "equal", among: [] },
  { kind: "equal", among: ["ana", "ana"] },
  { kind: "shares", shares: { ana: 1.5, ben: 1 } },
  { kind: "shares", shares: { ana: 0, ben: 1 } },
  { kind: "percent", percents: { ana: 50, ben: 49 } },
  { kind: "percent", percents: { ana: 33.333, ben: 66.667 } },
  { kind: "exact", amounts: { ana: 1000, ben: 2000 } },
  { kind: "exact", amounts: { ana: 9550, ben: -1000 } },
];
for (const split of refused) assert.throws(() => sharesOf(t, split), SplitError);

// --- a weekend away: four friends, four expenses
{
  const g = trip();
  assert.deepEqual(cents(g.balances()), { ana: 22_312, ben: -4_587, chloe: -9_075, dev: -8_650 });
  assert.equal([...g.balances().values()].reduce((a, b) => a + b.cents, 0), 0);
  const debts = g.pairwise();
  assert.equal(debts.length, 6);                        // every pair of the four owes something
  const asMap = (m: Map<string, Money>) => new Map([...m].map(([k, v]) => [k, v.cents]));
  const plan = greedy(asMap(g.balances()));
  assert.equal(plan.length, 3);
  assert.ok([...apply(asMap(g.balances()), plan).values()].every((c) => c === 0));
  // settling up through the app: each transfer recorded as a payment brings everyone to zero
  for (const p of plan) g.recordPayment(p.from, p.to, p.cents);
  assert.ok([...g.balances().values()].every((m) => m.isZero()));
  // ...but the pair-by-pair view still shows debts: each person's add up to zero, and none of them is real
  const left = g.pairwise();
  console.log("after settling by the simplified plan, pair-by-pair debts:", left.map((d) => `${d.from}→${d.to} ${d.amount.cents}`).join(", "));
  assert.equal(left.length, 6);
  for (const who of ["ana", "ben", "chloe", "dev"]) {
    assert.equal(left.reduce((sum, d) => sum + (d.to === who ? d.amount.cents : d.from === who ? -d.amount.cents : 0), 0), 0);
  }
}
{
  // a mistake is reversed, not deleted, and the balances return to where they were
  const g = trip();
  const before = cents(g.balances());
  g.addExpense({ id: "e5", description: "wrong amount", paidBy: "ben", cents: 99_999, split: { kind: "equal", among: ["ana", "ben", "chloe", "dev"] } });
  assert.notDeepEqual(cents(g.balances()), before);
  g.reverse("e5");
  assert.deepEqual(cents(g.balances()), before);
  assert.throws(() => g.reverse("e5"), /already reversed/);
  assert.throws(() => g.addExpense({ id: "e1", description: "again", paidBy: "ana", cents: 100, split: { kind: "equal", among: ["ana"] } }), /already exists/);
  assert.throws(() => g.addExpense({ id: "e6", description: "x", paidBy: "zoe", cents: 100, split: { kind: "equal", among: ["ana"] } }), /not in this group/);
  assert.throws(() => g.addExpense({ id: "e7", description: "x", paidBy: "ana", cents: 100, split: { kind: "equal", among: ["ana", "zoe"] } }), /not in this group/);
}

// --- balances always add up to zero: 20,000 random entries
{
  const random = seeded(2);
  const people = ["a", "b", "c", "d", "e", "f"];
  const g = new Group("EUR", people);
  const pick = () => people[Math.floor(random() * people.length)] as string;
  let refusedCount = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const r = random();
    try {
      if (r < 0.7) {
        const among = people.filter(() => random() < 0.6);
        const kind = Math.floor(random() * 3);
        const split: Split = kind === 0 ? { kind: "equal", among }
          : kind === 1 ? { kind: "shares", shares: Object.fromEntries(among.map((p) => [p, 1 + Math.floor(random() * 3)])) }
          : { kind: "percent", percents: Object.fromEntries(among.map((p, j) => [p, j === 0 ? 100 - 10 * (among.length - 1) : 10])) };
        g.addExpense({ id: `x${i}`, description: "", paidBy: pick(), cents: 1 + Math.floor(random() * 50_000), split });
      } else if (r < 0.9) g.recordPayment(pick(), pick(), 1 + Math.floor(random() * 5_000));
      else g.reverse(`x${Math.floor(random() * i)}`);
    } catch { refusedCount += 1; }
    if (i % 1000 === 0) assert.equal([...g.balances().values()].reduce((a, b) => a + b.cents, 0), 0);
  }
  assert.equal([...g.balances().values()].reduce((a, b) => a + b.cents, 0), 0);
  console.log(`20,000 random entries, ${refusedCount} refused; balances added up to zero throughout`);
}

// --- the fewest transfers: checked against trying every way of dividing people into groups
function partitions<T>(items: readonly T[]): T[][][] {
  if (items.length === 0) return [[]];
  const [first, ...rest] = items as [T, ...T[]];
  return partitions(rest).flatMap((p) => [[[first], ...p], ...p.map((_, i) => p.map((b, j) => (i === j ? [first, ...b] : b)))]);
}
const zeroSumGroups = (values: number[]) =>
  Math.max(...partitions(values).filter((p) => p.every((b) => b.reduce((a, c) => a + c, 0) === 0)).map((p) => p.length));
{
  const random = seeded(3);
  for (let trial = 0; trial < 300; trial += 1) {
    const n = 2 + Math.floor(random() * 6);
    const values = Array.from({ length: n - 1 }, () => (Math.floor(random() * 9) - 4) * 500);
    values.push(-values.reduce((a, b) => a + b, 0));
    const balances = new Map(values.map((v, i) => [`p${i}`, v]));
    const nonzero = values.filter((v) => v !== 0);
    const plan = fewest(balances);
    assert.ok([...apply(balances, plan).values()].every((c) => c === 0));
    assert.equal(plan.length, nonzero.length - (nonzero.length ? zeroSumGroups(nonzero) : 0));
    const g = greedy(balances);
    assert.ok([...apply(balances, g).values()].every((c) => c === 0));
    assert.ok(g.length >= plan.length && g.length <= Math.max(0, nonzero.length - 1));
  }
}

// --- a small case where the greedy plan is not the shortest
{
  const balances = new Map([["ana", 3000], ["ben", 2000], ["chloe", 2000], ["dev", -4000], ["eve", -3000]]);
  const g = greedy(balances), f = fewest(balances);
  const show = (ts: Transfer[]) => ts.map((x) => `${x.from}→${x.to} ${x.cents}`).join(", ");
  console.log(`greedy ${g.length}: ${show(g)} | fewest ${f.length}: ${show(f)}`);
  assert.equal(g.length, 4);
  assert.equal(f.length, 3);
}

// --- how often does greedy need more? Coincidences that make zero-sum subgroups are common when amounts are round
{
  const round = compareOn(10, "round", 500, 1), any = compareOn(10, "any", 500, 2);
  console.log("greedy against fewest, 500 groups of 10:", JSON.stringify(round), JSON.stringify(any));
  assert.ok(round.greedyLonger > 100 && any.greedyLonger < 20);
}

console.log("all expense sharing tests passed");
