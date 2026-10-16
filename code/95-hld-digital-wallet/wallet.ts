import { createHash } from "node:crypto";

// An event-sourced wallet partition. Commands are requests; decide() checks one against the current
// state and returns events, facts that have happened; apply() is the only code that changes state.
// Both are pure and deterministic: no clock, no randomness, no I/O. So every replica that applies
// the same events in the same order reaches the same state, and any past state can be rebuilt.
// Amounts are whole cents.
export type Command =
  | { type: "open"; account: string }
  | { type: "deposit"; account: string; amount: number; ref: string }
  | { type: "transfer"; id: string; from: string; to: string; amount: number }
  | { type: "send"; id: string; from: string; amount: number; toPartition: number; to: string }   // first half of a transfer to another partition
  | { type: "receive"; id: string; to: string; amount: number }                                 // second half, on the other partition
  | { type: "settle"; id: string; ok: boolean };                                                 // the sender learns the outcome

export type Event =
  | { type: "Opened"; account: string }
  | { type: "Deposited"; account: string; amount: number; ref: string }
  | { type: "Transferred"; id: string; from: string; to: string; amount: number }
  | { type: "SendStarted"; id: string; from: string; amount: number; toPartition: number; to: string }
  | { type: "Received"; id: string; to: string; amount: number }
  | { type: "ReceiveRefused"; id: string; reason: string }
  | { type: "SendCompleted"; id: string }
  | { type: "SendReturned"; id: string }
  | { type: "Rejected"; id: string; reason: string };

export interface State {
  balances: Map<string, number>;
  outgoing: Map<string, { from: string; amount: number }>;  // sent, not yet settled: money in flight
  seen: Set<string>;                                           // transfer and deposit ids already handled
  version: number;                                             // events applied
}
export const empty = (): State => ({ balances: new Map(), outgoing: new Map(), seen: new Set(), version: 0 });

export function decide(s: State, c: Command): Event[] {
  const has = (a: string) => s.balances.has(a);
  const bal = (a: string) => s.balances.get(a) ?? 0;
  switch (c.type) {
    case "open": return has(c.account) ? [] : [{ type: "Opened", account: c.account }];
    case "deposit": return s.seen.has(c.ref) || !has(c.account) || c.amount <= 0 ? [] : [{ type: "Deposited", account: c.account, amount: c.amount, ref: c.ref }];
    case "transfer":
      if (s.seen.has(c.id)) return [];                                         // a retry of a transfer already decided
      if (!has(c.from) || !has(c.to)) return [{ type: "Rejected", id: c.id, reason: "no such account" }];
      if (!Number.isSafeInteger(c.amount) || c.amount <= 0) return [{ type: "Rejected", id: c.id, reason: "bad amount" }];
      if (bal(c.from) < c.amount) return [{ type: "Rejected", id: c.id, reason: "insufficient funds" }];
      return [{ type: "Transferred", id: c.id, from: c.from, to: c.to, amount: c.amount }];
    case "send":
      if (s.seen.has(c.id)) return [];
      if (!has(c.from) || bal(c.from) < c.amount || c.amount <= 0) return [{ type: "Rejected", id: c.id, reason: "insufficient funds" }];
      return [{ type: "SendStarted", id: c.id, from: c.from, amount: c.amount, toPartition: c.toPartition, to: c.to }];
    case "receive":
      if (s.seen.has(c.id)) return [];                                         // delivered twice: already received or refused
      return has(c.to) ? [{ type: "Received", id: c.id, to: c.to, amount: c.amount }] : [{ type: "ReceiveRefused", id: c.id, reason: "no such account" }];
    case "settle":
      if (!s.outgoing.has(c.id)) return [];
      return [c.ok ? { type: "SendCompleted", id: c.id } : { type: "SendReturned", id: c.id }];
  }
}

export function apply(s: State, e: Event): State {
  const add = (a: string, n: number) => s.balances.set(a, (s.balances.get(a) ?? 0) + n);
  switch (e.type) {
    case "Opened": s.balances.set(e.account, 0); break;
    case "Deposited": add(e.account, e.amount); s.seen.add(e.ref); break;
    case "Transferred": add(e.from, -e.amount); add(e.to, e.amount); s.seen.add(e.id); break;
    case "SendStarted": add(e.from, -e.amount); s.outgoing.set(e.id, { from: e.from, amount: e.amount }); s.seen.add(e.id); break;
    case "Received": add(e.to, e.amount); s.seen.add(e.id); break;
    case "ReceiveRefused": s.seen.add(e.id); break;
    case "SendCompleted": s.outgoing.delete(e.id); break;
    case "SendReturned": { const o = s.outgoing.get(e.id); if (o) add(o.from, o.amount); s.outgoing.delete(e.id); break; }
    case "Rejected": s.seen.add(e.id); break;
  }
  s.version += 1;
  return s;
}

// One partition: an append-only log of events and the state they produce.
export class Partition {
  readonly log: Event[] = [];
  state: State = empty();
  handle(c: Command): Event[] {
    const events = decide(this.state, c);
    for (const e of events) { this.log.push(e); apply(this.state, e); }
    return events;
  }
}

export function replay(log: readonly Event[], from: State = empty(), start = 0): State {
  const s = cloneState(from);
  for (let i = start; i < log.length; i += 1) apply(s, log[i] as Event);
  return s;
}
export function cloneState(s: State): State {
  return { balances: new Map(s.balances), outgoing: new Map(s.outgoing), seen: new Set(s.seen), version: s.version };
}
// A fingerprint of a state, to compare replicas and replays.
export function stateHash(s: State): string {
  const h = createHash("sha256");
  for (const [a, b] of [...s.balances].sort((x, y) => (x[0] < y[0] ? -1 : 1))) h.update(`${a}=${b};`);
  for (const [id, o] of [...s.outgoing].sort((x, y) => (x[0] < y[0] ? -1 : 1))) h.update(`${id}:${o.from}:${o.amount};`);
  h.update(`v${s.version}`);
  return h.digest("hex").slice(0, 16);
}
export const total = (s: State) => [...s.balances.values()].reduce((a, b) => a + b, 0) + [...s.outgoing.values()].reduce((a, o) => a + o.amount, 0);
