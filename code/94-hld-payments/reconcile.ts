import { seeded } from "./random.ts";
import { fee } from "./marketplace.ts";

// Reconciliation: our record of captured payments against the provider's settlement file, matched by
// our payment id, which we send to the provider with every charge and which it prints in the file.
export interface Ours { payment: string; amount: number; day: number }
export interface Theirs { payment: string; reference: string; gross: number; fee: number; net: number; day: number }
export type Finding = "matched" | "matched a day late" | "in their file, not in ours" | "in ours, not in their file" | "charged twice" | "amount differs" | "fee differs";

export interface Day { ours: Ours[]; theirs: Theirs[]; injected: Record<string, number> }

// A day of 10,000 payments, with problems put in on purpose, in known numbers.
export function makeDay(seed: number, payments = 10_000): Day {
  const random = seeded(seed);
  const ours: Ours[] = [], theirs: Theirs[] = [];
  const injected: Record<string, number> = { "missed webhook": 0, "recorded but failed": 0, "duplicate charge": 0, "wrong amount": 0, "after the cutoff": 0, "fee changed": 0 };
  let ref = 0;
  const line = (payment: string, gross: number, day: number, f = fee(gross)) => theirs.push({ payment, reference: `py_${++ref}`, gross, fee: f, net: gross - f, day });
  for (let i = 0; i < payments; i += 1) {
    const payment = `pay_${seed}_${i}`, amount = 500 + Math.floor(random() * 20_000), r = random();
    if (r < 0.0012) { injected["missed webhook"] += 1; line(payment, amount, 0); continue; }                 // charged; we never heard
    if (r < 0.0017) { injected["recorded but failed"] += 1; ours.push({ payment, amount, day: 0 }); continue; } // we wrote success after a timeout
    ours.push({ payment, amount, day: 0 });
    if (r < 0.0020) { injected["duplicate charge"] += 1; line(payment, amount, 0); line(payment, amount, 0); continue; }
    if (r < 0.0027) { injected["wrong amount"] += 1; line(payment, amount - 100, 0); continue; }             // captured less than we recorded
    if (r < 0.0067) { injected["after the cutoff"] += 1; line(payment, amount, 1); continue; }              // in tomorrow's file
    if (r < 0.0069) { injected["fee changed"] += 1; line(payment, amount, 0, fee(amount) + 15); continue; }
    line(payment, amount, 0);
  }
  return { ours, theirs, injected };
}

// Match today's records against today's file and tomorrow's, so that payments captured just
// before the cutoff are not reported as missing.
export function reconcile(ours: Ours[], theirs: Theirs[], day: number): Map<Finding, number> {
  const out = new Map<Finding, number>();
  const add = (f: Finding) => out.set(f, (out.get(f) ?? 0) + 1);
  const byPayment = new Map<string, Theirs[]>();
  for (const t of theirs) if (t.day === day || t.day === day + 1) byPayment.set(t.payment, [...(byPayment.get(t.payment) ?? []), t]);
  const seen = new Set<string>();
  for (const o of ours.filter((x) => x.day === day)) {
    seen.add(o.payment);
    const lines = byPayment.get(o.payment) ?? [];
    if (lines.length === 0) { add("in ours, not in their file"); continue; }
    if (lines.length > 1) { add("charged twice"); continue; }
    const t = lines[0] as Theirs;
    if (t.gross !== o.amount) add("amount differs");
    else if (t.fee !== fee(t.gross)) add("fee differs");
    else add(t.day === day ? "matched" : "matched a day late");
  }
  for (const [payment, lines] of byPayment) if (!seen.has(payment) && lines.some((l) => l.day === day)) add("in their file, not in ours");
  return out;
}
