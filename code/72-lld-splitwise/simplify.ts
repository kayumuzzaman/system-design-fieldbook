// Settling up: a list of transfers that brings every balance to zero. Balances are in cents and add up to zero.
export interface Transfer { from: string; to: string; cents: number }

function check(balances: ReadonlyMap<string, number>): void {
  const sum = [...balances.values()].reduce((a, b) => a + b, 0);
  if (sum !== 0) throw new Error(`balances add up to ${sum}, not 0`);
}

// The largest debt paid to the largest credit, again and again. Each transfer settles at least one person,
// so there are never more than n - 1 transfers for n people who are not already settled.
export function greedy(balances: ReadonlyMap<string, number>): Transfer[] {
  check(balances);
  const people = [...balances].filter(([, c]) => c !== 0).map(([who, cents]) => ({ who, cents }));
  const transfers: Transfer[] = [];
  for (;;) {
    let creditor = null, debtor = null;
    for (const p of people) {
      if (p.cents > 0 && (!creditor || p.cents > creditor.cents)) creditor = p;
      if (p.cents < 0 && (!debtor || p.cents < debtor.cents)) debtor = p;
    }
    if (!creditor || !debtor) return transfers;
    const cents = Math.min(creditor.cents, -debtor.cents);
    transfers.push({ from: debtor.who, to: creditor.who, cents });
    creditor.cents -= cents;
    debtor.cents += cents;
  }
}

// The fewest transfers. A group of people whose balances add up to zero can settle among themselves in
// (size - 1) transfers, so the fewest transfers for everyone is n minus the largest number of separate
// zero-sum groups. Finding that number is NP-hard; this tries every subset, which is fine up to about 20 people.
export function fewest(balances: ReadonlyMap<string, number>): Transfer[] {
  check(balances);
  const people = [...balances].filter(([, c]) => c !== 0);
  const n = people.length;
  if (n > 22) throw new Error("too many people to search every subset");
  const size = 1 << n;
  const sum = new Float64Array(size);
  const best = new Int8Array(size);   // the most zero-sum groups that this set of people can be split into
  const last = new Int8Array(size);   // the person added last on the way to that best
  for (let mask = 1; mask < size; mask += 1) {
    const low = 31 - Math.clz32(mask & -mask);
    sum[mask] = (sum[mask & (mask - 1)] as number) + (people[low] as [string, number])[1];
    let top = -1, who = -1;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i) && (best[mask ^ (1 << i)] as number) > top) { top = best[mask ^ (1 << i)] as number; who = i; }
    }
    best[mask] = top + (sum[mask] === 0 ? 1 : 0);
    last[mask] = who;
  }
  // Walk back to recover an order of people in which every zero-sum prefix closes a group, then settle each group.
  const order: number[] = [];
  for (let mask = size - 1; mask; mask ^= 1 << (last[mask] as number)) order.unshift(last[mask] as number);
  const transfers: Transfer[] = [];
  let group = new Map<string, number>(), running = 0;
  for (const i of order) {
    const [who, cents] = people[i] as [string, number];
    group.set(who, cents); running += cents;
    if (running === 0) { transfers.push(...greedy(group)); group = new Map(); }
  }
  return transfers;
}

// Applies transfers to balances: the test that a plan is correct is that everyone ends at zero.
export function apply(balances: ReadonlyMap<string, number>, transfers: readonly Transfer[]): Map<string, number> {
  const after = new Map(balances);
  for (const t of transfers) {
    after.set(t.from, (after.get(t.from) ?? 0) + t.cents);
    after.set(t.to, (after.get(t.to) ?? 0) - t.cents);
  }
  return after;
}
