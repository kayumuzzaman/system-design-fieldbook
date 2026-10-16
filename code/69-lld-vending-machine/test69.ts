import assert from "node:assert/strict";
import { denominations, greedyChange, makeChange, total, type Coin, type CoinCounts } from "./change.ts";
import { MachineError, Slot, VendingMachine, type Hardware } from "./machine.ts";

// --- change-making
const short: CoinCounts = { 25: 1, 10: 3 };
assert.equal(greedyChange(30, short), null); assert.deepEqual(makeChange(30, short), [10, 10, 10]);
assert.deepEqual(greedyChange(40, { 25: 1, 10: 1, 5: 1 }), [25, 10, 5]); assert.deepEqual(makeChange(40, { 25: 1, 10: 1, 5: 1 }), [25, 10, 5]);
assert.equal(greedyChange(40, { 25: 2, 10: 4 }), null); assert.deepEqual(makeChange(40, { 25: 2, 10: 4 }), [10, 10, 10, 10]);
assert.deepEqual(makeChange(0, {}), []); assert.equal(makeChange(5, { 10: 4 }), null); assert.equal(makeChange(35, { 25: 1, 5: 1 }), null);
assert.deepEqual(makeChange(75, { 100: 2, 25: 5, 10: 5 }), [25, 25, 25]);
// compare with trying every combination, on 3,000 random tills
let seed = 69; const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const bruteFewest = (amount: number, till: CoinCounts): number | null => {
  let best: number | null = null;
  const go = (i: number, left: number, used: number): void => {
    if (left === 0) { if (best === null || used < best) best = used; return; }
    if (i === denominations.length) return;
    const coin = denominations[i] as Coin;
    for (let n = Math.min(till[coin] ?? 0, Math.floor(left / coin)); n >= 0; n -= 1) go(i + 1, left - n * coin, used + n);
  };
  go(0, amount, 0);
  return best;
};
let possible = 0, greedyMissed = 0, greedyWasteful = 0;
for (let i = 0; i < 3000; i += 1) {
  const till: Record<number, number> = {}; for (const coin of denominations) till[coin] = Math.floor(random() * 4);
  const amount = 5 * Math.floor(random() * 80);
  const exact = makeChange(amount, till), brute = bruteFewest(amount, till), greedy = greedyChange(amount, till);
  assert.equal(exact === null ? null : exact.length, brute);                                     // same answer as exhaustive search, and as few coins
  if (exact) {
    possible += 1; assert.equal(total(exact), amount);
    for (const coin of denominations) assert.ok(exact.filter((c) => c === coin).length <= (till[coin] ?? 0));
    if (!greedy) greedyMissed += 1; else if (greedy.length > exact.length) greedyWasteful += 1;
  } else assert.equal(greedy, null);
}
console.log(`change: 30 from one 25 and three 10s -> greedy ${JSON.stringify(greedyChange(30, short))}, exact ${JSON.stringify(makeChange(30, short))} | 3000 random tills: change possible in ${possible}, greedy failed to find it in ${greedyMissed} and used more coins in ${greedyWasteful}`);

// --- a fake machine body that records what it is told
class FakeHardware implements Hardware {
  released: string[] = []; returned: Coin[] = []; messages: string[] = [];
  release(slot: string): void { this.released.push(slot); }
  returnCoins(coins: Coin[]): void { this.returned.push(...coins); }
  show(message: string): void { this.messages.push(message); }
  get last(): string { return this.messages.at(-1) ?? ""; }
}
const build = (float: CoinCounts = { 25: 4, 10: 5, 5: 5 }) => {
  const hw = new FakeHardware();
  const machine = new VendingMachine(hw, [new Slot("A1", "Water", 125, 2), new Slot("A2", "Crisps", 70, 1), new Slot("B1", "Gum", 55, 0)], float);
  return { hw, machine };
};

// --- a sale with change
{
  const { hw, machine } = build();
  machine.insert(25); assert.deepEqual(hw.returned, [25]); assert.equal(hw.last, "Choose a product first"); // a coin with no selection comes straight back
  hw.returned = [];
  machine.select("A1"); assert.equal(machine.state, "awaiting payment");
  machine.insert(100); assert.equal(hw.last, "25 more"); assert.deepEqual(hw.released, []);
  machine.insert(100); assert.equal(machine.state, "dispensing"); assert.deepEqual(hw.released, ["A1"]);
  assert.equal(machine.cash.totalCents, 175); assert.equal(machine.slots.get("A1")?.quantity, 2);  // nothing is final until the product drops
  machine.insert(25); assert.deepEqual(hw.returned, [25]); hw.returned = [];                      // a coin during dispensing is returned
  machine.delivered();
  assert.equal(machine.state, "idle"); assert.deepEqual(hw.returned, [25, 25, 25]);
  assert.equal(machine.cash.totalCents, 175 + 125); assert.equal(machine.slots.get("A1")?.quantity, 1);
  console.log(`sale: Water at 125, paid 200, change ${JSON.stringify(hw.returned)}, cash box ${machine.cash.totalCents}, messages ${JSON.stringify(hw.messages)}`);
}
// --- cancel, sold out, unknown slot, exact amount
{
  const { hw, machine } = build();
  machine.select("B1"); assert.equal(hw.last, "Gum is sold out"); assert.equal(machine.state, "idle");
  machine.select("Z9"); assert.equal(hw.last, "No slot Z9");
  machine.select("A2"); machine.insert(25); machine.insert(25); machine.select("A1"); assert.equal(hw.last, "Cancel first to choose again");
  machine.cancel(); assert.deepEqual(hw.returned, [25, 25]); assert.equal(machine.state, "idle"); assert.equal(machine.cash.totalCents, 175);
  hw.returned = [];
  machine.select("A2"); machine.select("A1"); machine.select("A2");                               // changing your mind before paying is allowed
  for (const coin of [25, 25, 10, 10] as const) machine.insert(coin);
  machine.delivered(); assert.deepEqual(hw.returned, []); assert.equal(machine.cash.totalCents, 245);
  machine.select("A2"); assert.equal(hw.last, "Crisps is sold out");
}
// --- the machine uses the search, not the greedy method, and may use the coins just inserted
{
  const { hw, machine } = build({ 25: 1, 10: 3 });
  machine.select("A2"); machine.insert(100); machine.delivered();                                 // 30 in change from one 25 and three 10s
  assert.deepEqual(hw.returned, [10, 10, 10]);
  const empty = build({});
  empty.machine.select("A2"); empty.machine.insert(25); empty.machine.insert(25); empty.machine.insert(25); // paid 75 for 70 with an empty cash box
  assert.equal(empty.hw.last, "Cannot give change. Use the exact amount"); assert.deepEqual(empty.hw.returned, [25, 25, 25]); assert.deepEqual(empty.hw.released, []);
  const own = build({});
  own.machine.select("A2"); for (const coin of [25, 25, 10, 5, 10] as const) own.machine.insert(coin); // 75 paid: the 5 just inserted is the change
  own.machine.delivered(); assert.deepEqual(own.hw.returned, [5]); assert.equal(own.machine.cash.totalCents, 70);
}
// --- a jam: the customer gets everything back and the slot is closed
{
  const { hw, machine } = build();
  machine.select("A1"); machine.insert(100); machine.insert(25); machine.failed();
  assert.deepEqual(hw.returned, [100, 25]); assert.equal(machine.cash.totalCents, 175); assert.equal(machine.slots.get("A1")?.quantity, 2);
  machine.select("A1"); assert.equal(hw.last, "Water is sold out");
  // --- the operator
  assert.throws(() => machine.restock("A1", 10), /open the machine for service first/);
  machine.select("A2"); machine.insert(25); assert.throws(() => machine.openService(), /cannot open for service while awaiting payment/); machine.cancel();
  machine.openService(); assert.equal(machine.state, "maintenance");
  machine.select("A2"); assert.equal(hw.last, "Out of service"); hw.returned = []; machine.insert(10); assert.deepEqual(hw.returned, [10]);
  machine.restock("A1", 10); assert.throws(() => machine.restock("Q1", 1), MachineError);
  const taken = machine.collectCash({ 25: 2, 10: 2, 5: 2 });
  assert.equal(total(taken), 175 - 80); assert.equal(machine.cash.totalCents, 80);
  machine.closeService(); machine.select("A1"); assert.equal(machine.state, "awaiting payment");
  assert.throws(() => machine.closeService(), /not open for service/);
}

// --- money is conserved, whatever customers and the hardware do
{
  const hw = new FakeHardware();
  const stock = 400, prices: Record<string, number> = { A1: 125, A2: 70, B1: 55, B2: 200 };
  const machine = new VendingMachine(hw, Object.entries(prices).map(([code, price]) => new Slot(code, code, price, stock)), { 25: 10, 10: 10, 5: 10 });
  const float = machine.cash.totalCents; let inserted = 0, sales = 0, revenue = 0, jams = 0, refusals = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const roll = random();
    if (roll < 0.25) machine.select(["A1", "A2", "B1", "B2", "X0"][Math.floor(random() * 5)] as string);
    else if (roll < 0.9) { const coin = denominations[Math.floor(random() * 5)] as Coin; inserted += coin; machine.insert(coin); if (hw.last.startsWith("Cannot give change")) refusals += 1; }
    else machine.cancel();
    if (machine.state === "dispensing") {
      const code = hw.released.at(-1) as string;
      if (random() < 0.05) { machine.failed(); jams += 1; machine.openService(); machine.restock(code, machine.slots.get(code)?.quantity ?? 0); machine.closeService(); }
      else { machine.delivered(); sales += 1; revenue += prices[code] as number; }
    }
    if (machine.state === "idle") assert.equal(machine.cash.totalCents + total(hw.returned), float + inserted); // nothing created, nothing lost
  }
  machine.cancel();
  assert.equal(machine.cash.totalCents, float + revenue);                                          // the box holds the float and exactly the price of what was sold
  assert.equal([...machine.slots.values()].reduce((sum, s) => sum + (stock - s.quantity), 0), sales);
  console.log(`conservation: 20000 random events, ${sales} sales, ${jams} jams refunded, ${refusals} sales refused for lack of change; inserted ${inserted}, returned ${total(hw.returned)}, cash box grew by ${machine.cash.totalCents - float} = revenue ${revenue}`);
}
console.log("all assertions passed");
