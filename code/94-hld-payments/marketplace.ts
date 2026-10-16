import type { Ledger } from "./ledger.ts";

// The money of one marketplace order, as ledger transactions. Accounts:
//   psp:receivable     what the payment provider owes us for captured payments
//   seller:<id>        what we owe a seller
//   revenue:commission our 10% commission
//   expense:psp-fees   what the provider charges us per payment
//   bank:operating     our bank account
// Amounts are cents. The provider's fee is 2.9% + 30 cents, rounded to the nearest cent.
export const COMMISSION_BP = 1000;   // basis points: 10%
export const fee = (amount: number) => Math.round((amount * 290) / 10_000) + 30;
export const commission = (amount: number) => Math.round((amount * COMMISSION_BP) / 10_000);

export function capture(ledger: Ledger, order: string, seller: string, amount: number, at: number): void {
  const c = commission(amount);
  ledger.post(`capture:${order}`, at, `capture ${order}`, [
    { account: "psp:receivable", amount },
    { account: `seller:${seller}`, amount: -(amount - c) },
    { account: "revenue:commission", amount: -c },
  ]);
  ledger.post(`fee:${order}`, at, `provider fee ${order}`, [
    { account: "expense:psp-fees", amount: fee(amount) },
    { account: "psp:receivable", amount: -fee(amount) },
  ]);
}
// A refund gives the customer everything back, takes the seller's share back, and gives up the commission.
// The provider keeps its fee, so the fee stays an expense.
export function refund(ledger: Ledger, order: string, seller: string, amount: number, at: number): void {
  const c = commission(amount);
  ledger.post(`refund:${order}`, at, `refund ${order}`, [
    { account: "psp:receivable", amount: -amount },
    { account: `seller:${seller}`, amount: amount - c },
    { account: "revenue:commission", amount: c },
  ]);
}
// The provider pays out what it holds for us into our bank account.
export function settlement(ledger: Ledger, id: string, amount: number, at: number): void {
  ledger.post(`settle:${id}`, at, `provider settlement ${id}`, [
    { account: "bank:operating", amount },
    { account: "psp:receivable", amount: -amount },
  ]);
}
// We pay a seller what we owe them, from our bank account.
export function payout(ledger: Ledger, id: string, seller: string, amount: number, at: number): void {
  ledger.post(`payout:${id}`, at, `payout ${id}`, [
    { account: `seller:${seller}`, amount },
    { account: "bank:operating", amount: -amount },
  ]);
}
