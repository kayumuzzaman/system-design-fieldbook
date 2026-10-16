import { Money, type Currency } from "./money.ts";
import { sharesOf, type Split, type UserId } from "./split.ts";

export interface Expense {
  readonly id: string;
  readonly description: string;
  readonly paidBy: UserId;
  readonly amount: Money;
  readonly split: Split;                    // the rule, as entered
  readonly shares: ReadonlyMap<UserId, Money>; // the result, worked out once and kept
}
export interface Payment { readonly from: UserId; readonly to: UserId; readonly amount: Money }
type Entry = { kind: "expense"; expense: Expense } | { kind: "payment"; payment: Payment } | { kind: "reversal"; of: string };

// The aggregate: members, and an append-only list of what happened. Balances are worked out from the list.
export class Group {
  readonly currency: Currency;
  private readonly members = new Set<UserId>();
  private readonly entries: Entry[] = [];

  constructor(currency: Currency, members: readonly UserId[]) {
    this.currency = currency;
    for (const m of members) this.members.add(m);
  }

  addExpense(input: { id: string; description: string; paidBy: UserId; cents: number; split: Split }): Expense {
    if (this.findExpense(input.id)) throw new Error(`expense ${input.id} already exists`);
    if (!Number.isInteger(input.cents) || input.cents <= 0) throw new Error("an expense is a positive amount");
    this.requireMember(input.paidBy);
    const amount = Money.of(input.cents, this.currency);
    const shares = sharesOf(amount, input.split);
    for (const person of shares.keys()) this.requireMember(person);
    const expense: Expense = { id: input.id, description: input.description, paidBy: input.paidBy, amount, split: input.split, shares };
    this.entries.push({ kind: "expense", expense });
    return expense;
  }

  // Money handed over outside the app, recorded so that balances move toward zero.
  recordPayment(from: UserId, to: UserId, cents: number): void {
    this.requireMember(from); this.requireMember(to);
    if (from === to || !Number.isInteger(cents) || cents <= 0) throw new Error("a payment is a positive amount between two people");
    this.entries.push({ kind: "payment", payment: { from, to, amount: Money.of(cents, this.currency) } });
  }

  // A mistake is undone by a new entry that cancels it. Nothing is ever edited or removed.
  reverse(expenseId: string): void {
    if (!this.findExpense(expenseId)) throw new Error(`no expense ${expenseId}`);
    if (this.entries.some((e) => e.kind === "reversal" && e.of === expenseId)) throw new Error(`expense ${expenseId} is already reversed`);
    this.entries.push({ kind: "reversal", of: expenseId });
  }

  // The expenses that count: everything added, less what has been reversed.
  expenses(): Expense[] {
    return this.live().flatMap((e) => (e.kind === "expense" ? [e.expense] : []));
  }

  // Each person's net position: positive if the group owes them, negative if they owe the group.
  balances(): Map<UserId, Money> {
    const net = new Map<UserId, Money>([...this.members].map((m) => [m, Money.zero(this.currency)]));
    const add = (who: UserId, m: Money) => net.set(who, (net.get(who) as Money).plus(m));
    for (const e of this.live()) {
      if (e.kind === "expense") {
        add(e.expense.paidBy, e.expense.amount);
        for (const [who, share] of e.expense.shares) add(who, share.negate());
      } else if (e.kind === "payment") {
        add(e.payment.from, e.payment.amount);
        add(e.payment.to, e.payment.amount.negate());
      }
    }
    return net;
  }

  // Who owes whom without simplifying: every expense creates debts to its payer, netted for each pair of people.
  pairwise(): Payment[] {
    const owed = new Map<string, number>(); // "a→b": cents a owes b
    const move = (from: UserId, to: UserId, cents: number) => {
      const [x, y, c] = from < to ? [from, to, cents] : [to, from, -cents];
      owed.set(`${x}→${y}`, (owed.get(`${x}→${y}`) ?? 0) + c);
    };
    for (const e of this.live()) {
      if (e.kind === "expense") for (const [who, share] of e.expense.shares) if (who !== e.expense.paidBy) move(who, e.expense.paidBy, share.cents);
      if (e.kind === "payment") move(e.payment.to, e.payment.from, e.payment.amount.cents);
    }
    const debts: Payment[] = [];
    for (const [pair, cents] of owed) {
      const [x, y] = pair.split("→") as [UserId, UserId];
      if (cents > 0) debts.push({ from: x, to: y, amount: Money.of(cents, this.currency) });
      if (cents < 0) debts.push({ from: y, to: x, amount: Money.of(-cents, this.currency) });
    }
    return debts;
  }

  private live(): Entry[] {
    const reversed = new Set(this.entries.flatMap((e) => (e.kind === "reversal" ? [e.of] : [])));
    return this.entries.filter((e) => !(e.kind === "expense" && reversed.has(e.expense.id)));
  }
  private findExpense(id: string): Expense | undefined {
    for (const e of this.entries) if (e.kind === "expense" && e.expense.id === id) return e.expense;
    return undefined;
  }
  private requireMember(who: UserId): void {
    if (!this.members.has(who)) throw new Error(`${who} is not in this group`);
  }
}
