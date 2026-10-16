import { createHash } from "node:crypto";

// A double-entry ledger. Money is whole minor units (cents). Every transaction is a set of lines
// on accounts whose amounts add up to zero: a debit is positive, a credit negative. Nothing is ever
// updated or deleted; a mistake is corrected by a new transaction that reverses it.
export interface Line { account: string; amount: number }
export interface Transaction { id: string; at: number; memo: string; lines: Line[]; previous: string; hash: string }

export class LedgerError extends Error {}

export class Ledger {
  private readonly journal: Transaction[] = [];
  private readonly ids = new Set<string>();
  private readonly balances = new Map<string, number>();

  // Posting is idempotent by transaction id: the same id twice records it once.
  post(id: string, at: number, memo: string, lines: Line[]): boolean {
    if (this.ids.has(id)) return false;
    if (lines.length < 2) throw new LedgerError("a transaction needs at least two lines");
    for (const l of lines) if (!Number.isSafeInteger(l.amount) || l.amount === 0) throw new LedgerError(`not a whole, non-zero amount: ${l.amount}`);
    if (lines.reduce((sum, l) => sum + l.amount, 0) !== 0) throw new LedgerError(`lines of ${id} do not add up to zero`);
    const previous = this.journal.length ? (this.journal[this.journal.length - 1] as Transaction).hash : "";
    const tx: Transaction = { id, at, memo, lines: lines.map((l) => ({ ...l })), previous, hash: "" };
    tx.hash = hashOf(tx);
    this.journal.push(tx);
    this.ids.add(id);
    for (const l of lines) this.balances.set(l.account, (this.balances.get(l.account) ?? 0) + l.amount);
    return true;
  }
  balance(account: string): number {
    return this.balances.get(account) ?? 0;
  }
  // The sum of every balance: zero, always, if every transaction balanced.
  trialBalance(): number {
    let sum = 0;
    for (const v of this.balances.values()) sum += v;
    return sum;
  }
  entries(): readonly Transaction[] {
    return this.journal;
  }
  allBalances(): Map<string, number> {
    return new Map(this.balances);
  }
}

// Balances as of any moment, recomputed from the journal alone.
export function replay(journal: readonly Transaction[], until = Infinity): Map<string, number> {
  const out = new Map<string, number>();
  for (const tx of journal) {
    if (tx.at > until) break;
    for (const l of tx.lines) out.set(l.account, (out.get(l.account) ?? 0) + l.amount);
  }
  return out;
}

// Each transaction carries the hash of the one before, so changing any past entry breaks the chain.
export function hashOf(tx: Transaction): string {
  return createHash("sha256").update(JSON.stringify([tx.previous, tx.id, tx.at, tx.memo, tx.lines])).digest("hex");
}
export function verifyChain(journal: readonly Transaction[]): number {
  let previous = "";
  for (let i = 0; i < journal.length; i += 1) {
    const tx = journal[i] as Transaction;
    if (tx.previous !== previous || tx.hash !== hashOf(tx)) return i;   // the first entry that does not fit
    previous = tx.hash;
  }
  return -1;
}
