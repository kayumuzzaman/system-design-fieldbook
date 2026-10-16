import { seeded } from "./random.ts";
import { Partition, total, type State } from "./wallet.ts";

// ---------------------------------------------------------------------------------------------
// 1. Moving money between two partitions while the process doing it can crash.
// "debit, then credit": two writes with nothing recording the transfer in between.
// "saga": the debit is an event that records the transfer (SendStarted); a relay delivers the
// credit at least once, the receiver ignores repeats, and the sender settles when it hears back.
export interface CrossResult { how: string; transfers: number; crashes: number; lost: number; lostCents: number; duplicatesIgnored: number; returned: number; conserved: boolean }

export function crossPartition(how: "debit, then credit" | "saga", transfers: number, crashRate: number, seed: number): CrossResult {
  const random = seeded(seed);
  const accounts = 4000, P = 4;
  const home = (a: string) => Number(a.slice(1)) % P;
  let crashes = 0, lost = 0, lostCents = 0, dupes = 0, returned = 0;
  const crash = () => { if (random() < crashRate) { crashes += 1; return true; } return false; };
  // the naive version: one balance table per partition, two UPDATEs in two databases
  const tables = Array.from({ length: P }, () => new Map<string, number>());
  const parts = Array.from({ length: P }, () => new Partition());
  for (let i = 0; i < accounts; i += 1) {
    const a = `a${i}`;
    (tables[home(a)] as Map<string, number>).set(a, 100_000);
    const p = parts[home(a)] as Partition;
    p.handle({ type: "open", account: a });
    p.handle({ type: "deposit", account: a, amount: 100_000, ref: `d${i}` });
  }
  const sumTables = () => tables.reduce((s, t) => s + [...t.values()].reduce((a, b) => a + b, 0), 0);
  const sumParts = () => parts.reduce((s, p) => s + total(p.state), 0);
  const before = how === "saga" ? sumParts() : sumTables();
  for (let t = 0; t < transfers; t += 1) {
    const from = `a${Math.floor(random() * accounts)}`;
    let to = `a${Math.floor(random() * accounts)}`;
    if (home(from) === home(to)) to = `a${(Number(to.slice(1)) + 1) % accounts}`;   // always across partitions
    const closed = random() < 0.001;                                                // the receiving account was just closed
    const amount = 100 + Math.floor(random() * 5000), id = `t${t}`;
    if (how === "debit, then credit") {
      const ta = tables[home(from)] as Map<string, number>, tb = tables[home(to)] as Map<string, number>;
      if ((ta.get(from) as number) < amount || closed) continue;
      ta.set(from, (ta.get(from) as number) - amount);                // UPDATE … SET balance = balance - amount
      if (crash()) { lost += 1; lostCents += amount; continue; }      // the process dies: nothing records the transfer
      tb.set(to, (tb.get(to) as number) + amount);                    // UPDATE … SET balance = balance + amount
    } else {
      const pa = parts[home(from)] as Partition, pb = parts[home(to)] as Partition;
      const target = closed ? `closed-${to}` : to;
      const d = pa.handle({ type: "send", id, from, amount, toPartition: home(to), to: target });
      if (d[0]?.type !== "SendStarted") continue;                       // the debit and the record of the transfer: one event
      // the relay delivers at least once; a crash before or after delivering means it delivers again
      for (;;) {
        if (crash()) continue;
        const r = pb.handle({ type: "receive", id, to: target, amount });
        if (r.length === 0) dupes += 1;                                 // a repeat, recognized by its id
        if (crash()) continue;
        const ok = pb.log.length > 0 && pb.state.seen.has(id) && pb.state.balances.has(target);
        const s = pa.handle({ type: "settle", id, ok });
        if (s[0]?.type === "SendReturned") returned += 1;
        break;
      }
    }
  }
  const after = how === "saga" ? sumParts() : sumTables();
  return { how, transfers, crashes, lost, lostCents, duplicatesIgnored: dupes, returned, conserved: after === before };
}

// ---------------------------------------------------------------------------------------------
// 2. What each protocol makes others wait for. Transfers arrive at a steady rate; one merchant
// account receives a tenth of them. A coordinator crash in the middle of a transfer is repaired
// after `recoveryMs`. Two-phase commit holds both accounts locked until then. Try-confirm-cancel
// freezes only the amount being moved. A saga holds nothing, but the money is in flight.
export type Protocol = "two-phase commit" | "try-confirm-cancel" | "saga";
export const PROTOCOLS: Protocol[] = ["two-phase commit", "try-confirm-cancel", "saga"];
export interface WaitResult { protocol: Protocol; transfers: number; crashes: number; delayed: number; delayedOverSecond: number; meanWaitMs: number; frozenCentSeconds: number; inFlightCentSeconds: number }

export function waits(protocol: Protocol, transfers: number, perSecond: number, crashRate: number, recoveryMs: number, seed: number): WaitResult {
  const random = seeded(seed);
  const lockedUntil = new Map<string, number>();
  const stepMs = 2;                                                           // one round trip between services
  let crashes = 0, delayed = 0, over = 0, waited = 0, frozen = 0, inFlight = 0;
  for (let i = 0; i < transfers; i += 1) {
    const arrive = (i / perSecond) * 1000;
    const from = `a${Math.floor(random() * 100_000)}`;
    const to = random() < 0.1 ? "merchant" : `a${Math.floor(random() * 100_000)}`;
    const amount = 100 + Math.floor(random() * 5000);
    const crashed = random() < crashRate;
    if (crashed) crashes += 1;
    let start = arrive;
    if (protocol === "two-phase commit") {
      start = Math.max(arrive, lockedUntil.get(from) ?? 0, lockedUntil.get(to) ?? 0);
      const held = crashed ? recoveryMs : 2 * stepMs;                         // prepared, then the coordinator vanished
      lockedUntil.set(from, start + held); lockedUntil.set(to, start + held);
    } else if (protocol === "try-confirm-cancel") {
      frozen += (amount * (crashed ? recoveryMs : 2 * stepMs)) / 1000;      // the reserved amount cannot be spent meanwhile
    } else {
      inFlight += (amount * (crashed ? recoveryMs : stepMs)) / 1000;         // debited, not yet credited
    }
    const w = start - arrive;
    if (w > 0) { delayed += 1; waited += w; if (w > 1000) over += 1; }
  }
  return { protocol, transfers, crashes, delayed, delayedOverSecond: over, meanWaitMs: delayed ? Math.round(waited / delayed) : 0, frozenCentSeconds: Math.round(frozen), inFlightCentSeconds: Math.round(inFlight) };
}
export type { State };
