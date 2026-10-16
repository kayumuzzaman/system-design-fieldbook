import assert from "node:assert/strict";
import { day, LendingError, Library, standardPolicy } from "./lending.ts";

const setUp = () => {
  const library = new Library();
  library.join("ana", "Ana"); library.join("ben", "Ben"); library.join("chi", "Chi");
  for (const [id, isbn] of [["c1", "dune"], ["c2", "dune"], ["c3", "emma"], ["c4", "ulysses"], ["c5", "beloved"]] as const) library.addCopy(id, isbn);
  return library;
};
const today = day("2026-10-12");
assert.equal(day("1970-01-02"), 1); assert.equal(day("2026-10-26") - today, 14);

// --- the scenario walked through in the chapter
const library = setUp();
const loan = library.borrow("ana", "dune", today);
assert.equal(loan.copy, "c1"); assert.equal(loan.dueOn, day("2026-10-26"));
library.borrow("ben", "dune", today);                                                           // the second copy
assert.throws(() => library.borrow("chi", "dune", today), /no copy of dune is available/);
library.borrow("ana", "emma", today); library.borrow("ana", "ulysses", today);
assert.throws(() => library.borrow("ana", "beloved", today), /Ana already has 3 books/);
assert.equal(library.giveBack("c3", day("2026-10-26")), 0);                                     // on the due date: no fine
assert.equal(library.giveBack("c1", day("2026-10-31")), 125);                                   // five days late
assert.equal(library.member("ana").finesCents, 125); assert.equal(library.member("ana").openLoans, 1);
assert.throws(() => library.giveBack("c1", today), /copy c1 is not on loan/);
assert.equal(library.borrow("chi", "dune", day("2026-10-31")).copy, "c1");                      // the returned copy goes out again
assert.equal(library.giveBack("c4", day("2026-11-10")), 375);                                   // fifteen days late
assert.throws(() => library.borrow("ana", "emma", day("2026-11-10")), /Ana owes 500 cents in fines/);
library.member("ana").pay(200);
assert.equal(library.borrow("ana", "emma", day("2026-11-10")).copy, "c3");
assert.throws(() => library.member("ana").pay(1000), LendingError);
assert.throws(() => library.borrow("zed", "emma", today), /no member zed/);
console.log("scenario: 3 loans then refused at the limit | on time 0, five days late 125, fifteen days late 375 | blocked at 500 cents owed, allowed again after paying 200");

// --- the invariants hold after any sequence of operations
let state = 20261012;
const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const big = setUp(); let now = today, done = 0, refused = 0;
for (let i = 0; i < 20_000; i += 1) {
  now += Math.floor(random() * 3);
  try {
    const roll = random();
    if (roll < 0.5) big.borrow(pick(["ana", "ben", "chi"]), pick(["dune", "emma", "ulysses", "beloved"]), now);
    else if (roll < 0.9) big.giveBack(pick(["c1", "c2", "c3", "c4", "c5"]), now);
    else { const m = big.member(pick(["ana", "ben", "chi"])); m.pay(Math.max(1, Math.floor(random() * m.finesCents))); }
    done += 1;
  } catch (error) {
    assert.ok(error instanceof LendingError); refused += 1;
  }
  const onLoan = big.allCopies.filter((c) => !c.available);
  assert.equal(onLoan.length, big.allMembers.reduce((sum, m) => sum + m.openLoans, 0));       // both sides of every loan agree
  for (const m of big.allMembers) { assert.ok(m.openLoans <= standardPolicy.maxLoans); assert.ok(m.finesCents >= 0); }
  for (const c of onLoan) assert.equal(c.currentLoan?.copy, c.id);
}
console.log(`invariants: held after each of 20000 random operations (${done} carried out, ${refused} refused)`);
console.log("all assertions passed");
