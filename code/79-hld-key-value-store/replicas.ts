// Replicas and a coordinator, simulated: writes go to the replicas of a key and succeed when W confirm;
// reads ask the replicas and answer when R have replied, with the newest version among the replies.
import type { Rng } from "./rng.ts";
import type { Sim } from "./sim.ts";

export interface Versioned {
  version: number; // higher is newer; this chapter's writers number their writes
}

export class Replica {
  readonly name: string;
  up = true; // when false, messages to it are lost
  readonly data = new Map<string, Versioned>();
  readonly hints: { key: string; value: Versioned; owner: Replica }[] = [];

  constructor(name: string) {
    this.name = name;
  }
  apply(key: string, value: Versioned): void {
    const old = this.data.get(key);
    if (!old || old.version < value.version) this.data.set(key, value);
  }
}

export interface NetworkOptions {
  readonly oneWayMs: number; // typical delay each way
  readonly jitterMs: number; // added: an exponential delay with this mean
  readonly slowShare: number; // share of messages that are badly delayed, as by a pause on the receiving node
  readonly slowMs: number;
}
export const LAN: NetworkOptions = { oneWayMs: 0.2, jitterMs: 0.2, slowShare: 0.01, slowMs: 20 };

export interface Quorum {
  readonly n: number;
  readonly w: number;
  readonly r: number;
  readonly sloppy: boolean; // stand-ins may take writes for unreachable replicas, with a hint
  readonly readRepair: boolean;
  readonly timeoutMs: number;
}

export interface Answer {
  ok: boolean;
  ms: number;
  value?: Versioned;
}

export class Coordinator {
  private readonly sim: Sim;
  private readonly rng: Rng;
  private readonly net: NetworkOptions;
  readonly q: Quorum;
  // What the coordinator believes is down, from the membership protocol (gossip and a failure detector).
  readonly believedDown = new Set<Replica>();

  constructor(sim: Sim, rng: Rng, q: Quorum, net: NetworkOptions = LAN) {
    this.sim = sim;
    this.rng = rng;
    this.q = q;
    this.net = net;
  }

  private delay(): number {
    const { oneWayMs, jitterMs, slowShare, slowMs } = this.net;
    return oneWayMs - jitterMs * Math.log(1 - this.rng.float()) + (this.rng.float() < slowShare ? slowMs : 0);
  }
  // A message to a replica and its reply. Lost both ways if the replica is down when it arrives.
  private call<T>(to: Replica, work: () => T, reply: (result: T) => void): void {
    this.sim.after(this.delay(), () => {
      if (!to.up) return;
      const result = work();
      this.sim.after(this.delay(), () => reply(result));
    });
  }

  // The nodes a request goes to. `preference` is the key's preference list: its n home replicas, then the
  // nodes after them on the ring. A strict quorum uses the home replicas only; a sloppy one skips the ones
  // believed down and takes the next nodes instead.
  targets(preference: readonly Replica[]): { node: Replica; for: Replica }[] {
    const home = preference.slice(0, this.q.n);
    if (!this.q.sloppy) return home.map((node) => ({ node, for: node }));
    const missing = home.filter((h) => this.believedDown.has(h));
    const standIns = preference.slice(this.q.n).filter((p) => !this.believedDown.has(p));
    const out = home.filter((h) => !this.believedDown.has(h)).map((node) => ({ node, for: node }));
    missing.forEach((owner, i) => { if (standIns[i]) out.push({ node: standIns[i]!, for: owner }); });
    return out;
  }

  write(preference: readonly Replica[], key: string, value: Versioned, done: (a: Answer) => void): void {
    const started = this.sim.now;
    let acks = 0, finished = false;
    const finish = (ok: boolean) => { if (!finished) { finished = true; done({ ok, ms: this.sim.now - started }); } };
    this.sim.after(this.q.timeoutMs, () => finish(false));
    for (const t of this.targets(preference)) {
      this.call(t.node, () => {
        if (t.node === t.for) t.node.apply(key, value);
        else t.node.hints.push({ key, value, owner: t.for }); // kept for its owner, delivered later
        return true;
      }, () => { if (++acks >= this.q.w) finish(true); });
    }
  }

  read(preference: readonly Replica[], key: string, done: (a: Answer) => void): void {
    const started = this.sim.now;
    const targets = this.targets(preference);
    const replies: { node: Replica; value: Versioned | undefined }[] = [];
    let finished = false;
    const newest = () => replies.reduce<Versioned | undefined>((a, r) => (r.value && (!a || r.value.version > a.version) ? r.value : a), undefined);
    this.sim.after(this.q.timeoutMs, () => {
      if (!finished) { finished = true; done({ ok: false, ms: this.sim.now - started }); }
      if (this.q.readRepair) this.repair(key, replies, newest());
    });
    for (const t of targets) {
      this.call(t.node, () => (t.node === t.for ? t.node.data.get(key) : t.node.hints.filter((h) => h.key === key && h.owner === t.for).at(-1)?.value), (value) => {
        replies.push({ node: t.node, value });
        if (!finished && replies.length >= this.q.r) {
          finished = true;
          done({ ok: true, ms: this.sim.now - started, value: newest() });
        }
      });
    }
  }

  // After the read has answered, write the newest version back to the replicas that replied with an older one.
  private repair(key: string, replies: { node: Replica; value: Versioned | undefined }[], best: Versioned | undefined): void {
    if (!best) return;
    for (const r of replies) if (!r.value || r.value.version < best.version) this.call(r.node, () => r.node.apply(key, best), () => {});
  }

  // A stand-in hands its hints to their owners, once it sees them up again.
  deliverHints(standIn: Replica): number {
    const ready = standIn.hints.filter((h) => !this.believedDown.has(h.owner));
    standIn.hints.splice(0, standIn.hints.length, ...standIn.hints.filter((h) => this.believedDown.has(h.owner)));
    for (const h of ready) this.call(h.owner, () => h.owner.apply(h.key, h.value), () => {});
    return ready.length;
  }
}
