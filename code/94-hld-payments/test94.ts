import assert from "node:assert/strict";
import { Ledger, LedgerError, replay, verifyChain } from "./ledger.ts";
import { capture, commission, fee, payout, refund, settlement } from "./marketplace.ts";
import { KEYS, run } from "./retries.ts";
import { makeDay, reconcile } from "./reconcile.ts";
import { seeded } from "./random.ts";

const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
const eur = (c: number) => (c / 100).toFixed(2);

// --- floating point is not money
{
  let float = 0, cents = 0;
  for (let i = 0; i < 1_000_000; i += 1) { float += 0.1; cents += 10; }
  console.log(`a million payments of 0.10: as floating point ${float}, as whole cents ${eur(cents)}`);
  assert.notEqual(float, 100_000);
  assert.equal(cents, 10_000_000);
}

// --- one order, entry by entry
{
  const l = new Ledger();
  capture(l, "o1", "s1", 10_000, 1);
  console.log(`capture 100.00: fee ${eur(fee(10_000))}, commission ${eur(commission(10_000))}; seller owed ${eur(-l.balance("seller:s1"))}, provider owes us ${eur(l.balance("psp:receivable"))}`);
  settlement(l, "d1", l.balance("psp:receivable"), 2);
  payout(l, "w1", "s1", -l.balance("seller:s1"), 3);
  console.log(`after settlement and payout: bank ${eur(l.balance("bank:operating"))}, commission ${eur(-l.balance("revenue:commission"))}, fees ${eur(l.balance("expense:psp-fees"))}; trial balance ${l.trialBalance()}`);
  assert.equal(l.balance("bank:operating"), -l.balance("revenue:commission") - l.balance("expense:psp-fees"));
  assert.equal(l.post("capture:o1", 4, "again", [{ account: "a", amount: 1 }, { account: "b", amount: -1 }]), false);   // same id: recorded once
  assert.throws(() => l.post("bad", 5, "unbalanced", [{ account: "a", amount: 100 }, { account: "b", amount: -99 }]), LedgerError);
  assert.throws(() => l.post("bad2", 5, "fraction", [{ account: "a", amount: 0.5 }, { account: "b", amount: -0.5 }]), LedgerError);
}

// --- 100,000 random operations: the books balance after every one, and replay gives the same state
{
  const random = seeded(7), l = new Ledger();
  const open: { order: string; seller: string; amount: number }[] = [];
  let n = 0, refused = 0;
  for (let i = 0; i < 100_000; i += 1) {
    const r = random();
    try {
      if (r < 0.6) { const o = `o${i}`, s = `s${Math.floor(random() * 50)}`, a = 100 + Math.floor(random() * 50_000); capture(l, o, s, a, i); open.push({ order: o, seller: s, amount: a }); }
      else if (r < 0.7 && open.length) {
        const k = Math.floor(random() * open.length), v = open[k] as (typeof open)[number];
        refund(l, v.order, v.seller, v.amount, i);
        open[k] = open[open.length - 1] as (typeof open)[number]; open.pop();
      }
      else if (r < 0.85) { const owed = l.balance("psp:receivable"); if (owed > 0) settlement(l, `d${i}`, owed, i); }
      else { const s = `s${Math.floor(random() * 50)}`, owed = -l.balance(`seller:${s}`); if (owed > 0) payout(l, `w${i}`, s, owed, i); }
      n += 1;
    } catch { refused += 1; }
    assert.equal(l.trialBalance(), 0);
  }
  const rebuilt = replay(l.entries());
  for (const [account, v] of l.allBalances()) assert.equal(rebuilt.get(account) ?? 0, v);
  const mid = replay(l.entries(), 50_000);
  console.log(`${fmt(n)} random operations, ${fmt(l.entries().length)} transactions: trial balance 0 after every one; replay gives the same ${l.allBalances().size} balances; at the midpoint the bank held ${eur(mid.get("bank:operating") ?? 0)}`);
  assert.equal(refused, 0);
  // tamper with one old entry: the chain shows where
  assert.equal(verifyChain(l.entries()), -1);
  const copy = l.entries().map((t) => ({ ...t, lines: t.lines.map((x) => ({ ...x })) }));
  (copy[1234]?.lines[0] as { amount: number }).amount += 1;
  (copy[1234]?.lines[1] as { amount: number }).amount -= 1;    // still balanced, but changed
  console.log(`changing one old entry, still balanced, is caught by the hash chain at transaction ${verifyChain(copy)}`);
  assert.equal(verifyChain(copy), 1234);
}

// --- retries without keys, with a key from the app, and with one key end to end
console.log("double charges per 100,000 payments, by fault rate on each hop (one in a hundred = 1%):");
for (const rate of [0.005, 0.01, 0.02, 0.05]) {
  const rows = KEYS.map((k) => run(k, rate, 100_000, 42));
  console.log(`  ${(rate * 100).toFixed(1)}%: ` + rows.map((r) => `${r.keys}: ${fmt(r.chargedTwiceOrMore)} orders charged twice or more (${fmt(r.extraCharges)} extra charges), ${fmt(r.chargedButToldFailed)} charged but told it failed`).join("; "));
  const e2e = rows[2] as (typeof rows)[number];
  assert.equal(e2e.chargedTwiceOrMore, 0);
  assert.ok((rows[0] as (typeof rows)[number]).chargedTwiceOrMore > (rows[1] as (typeof rows)[number]).chargedTwiceOrMore);
}

// --- reconciliation finds every problem that was put in, and nothing else
{
  const day = makeDay(3);
  const found = reconcile(day.ours, day.theirs, 0);
  console.log(`reconciliation of ${fmt(day.ours.length)} records against ${fmt(day.theirs.length)} file lines: ` + [...found].map(([k, v]) => `${k} ${fmt(v)}`).join(", "));
  console.log(`  put in: ${Object.entries(day.injected).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  assert.equal(found.get("in their file, not in ours"), day.injected["missed webhook"]);
  assert.equal(found.get("in ours, not in their file"), day.injected["recorded but failed"]);
  assert.equal(found.get("charged twice"), day.injected["duplicate charge"]);
  assert.equal(found.get("amount differs"), day.injected["wrong amount"]);
  assert.equal(found.get("matched a day late"), day.injected["after the cutoff"]);
  assert.equal(found.get("fee differs"), day.injected["fee changed"]);
  // without tomorrow's file, the late ones look missing
  const strict = reconcile(day.ours, day.theirs.filter((t) => t.day === 0), 0);
  console.log(`  matching against today's file only reports ${fmt(strict.get("in ours, not in their file") ?? 0)} as missing instead of ${day.injected["recorded but failed"]}`);
}
console.log("ok");
