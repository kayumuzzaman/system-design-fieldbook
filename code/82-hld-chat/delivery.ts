import { MinHeap } from './heap.ts';
import { Rng } from './rng.ts';

// A group chat on unreliable connections, simulated event by event. Devices go offline and come back,
// a share of transmissions on a live connection is lost, and anything in flight when a device
// disconnects is lost too. The three delivery protocols run on the same people, writing at the same
// moments on the same devices; only the network's luck and the protocol differ.
export type Protocol = 'push only' | 'stored, no message ids' | 'stored, ids and sequence numbers';
export const PROTOCOLS: Protocol[] = ['push only', 'stored, no message ids', 'stored, ids and sequence numbers'];

export type ChatConfig = {
  readonly devices: readonly number[]; // devices of each member
  readonly seconds: number;            // members write messages during [0, seconds)
  readonly sendEvery: number;          // mean seconds between messages from one member
  readonly onlineMean: number;         // mean seconds a device stays connected
  readonly offlineMean: number;        // mean seconds it stays away
  readonly latency: number;            // one way, seconds, plus a random part with mean `jitter`
  readonly jitter: number;
  readonly loss: number;               // chance that one transmission on a live connection is lost
  readonly retryAfter: number;         // seconds without an acknowledgment before a sender tries again
  readonly heartbeat: number;          // seconds between the server's pings, which carry the newest sequence number
  readonly clockSkew: number;          // standard deviation of device clocks, seconds
  readonly replyShare: number;         // share of messages that answer an earlier one
  readonly typing: number;             // a reply answers the newest message seen at least this many seconds earlier
  readonly seed: number;
};

export const CHAT: ChatConfig = {
  devices: [2, 1, 2, 1, 1], seconds: 3_600, sendEvery: 6, onlineMean: 300, offlineMean: 60,
  latency: 0.03, jitter: 0.04, loss: 0.02, retryAfter: 2, heartbeat: 30, clockSkew: 1, replyShare: 0.5, typing: 2, seed: 82,
};

export type Message = {
  readonly clientId: number;     // chosen by the sending device; the same on every retry
  readonly device: number;       // the device it was written on
  readonly deviceSeq: number;    // 1, 2, 3 … for each device
  readonly writtenAt: number;    // true time
  readonly clock: number;        // the time the writer's own clock showed
  readonly replyTo: number;      // clientId of the message it answers, or -1
};
type Entry = { readonly seq: number; readonly msg: Message };

type Device = {
  readonly id: number;
  readonly member: number;
  readonly skew: number;
  online: boolean;
  epoch: number;                 // which connection; anything sent on an older one is lost
  lastSeq: number;               // highest sequence number shown with nothing missing below it
  readonly early: Map<number, Entry>;   // arrived ahead of a gap
  resumeSentAt: number;
  readonly shown: Entry[];       // others' messages, in display order
  readonly seen: [number, number][];    // [clientId, time] of every message on screen, own included
  readonly outbox: Map<number, Message>;
  written: number;
};

type Event =
  | { kind: 'toggle'; dev: number }
  | { kind: 'write'; member: number }
  | { kind: 'toServer'; dev: number; epoch: number; msg: Message }
  | { kind: 'resume'; dev: number; epoch: number; after: number }
  | { kind: 'toDevice'; dev: number; epoch: number; entries: Entry[]; newest: number }
  | { kind: 'ping'; dev: number; epoch: number }
  | { kind: 'ack'; dev: number; epoch: number; clientId: number }
  | { kind: 'retry'; dev: number; clientId: number };

export type DeliveryResult = {
  readonly protocol: Protocol;
  readonly messages: number;
  readonly expected: number;      // pairs of a message and a device other than the one it was written on
  readonly missing: number;       // pairs never shown
  readonly duplicates: number;    // extra copies shown
  readonly orderDisagreements: number;   // neighboring messages that another device shows in the opposite order
  readonly replies: number;
  readonly repliesAboveShown: number;    // replies shown above the message they answer, on some device
  readonly repliesAboveByClock: number;  // the same if devices sorted by the writer's clock
  readonly latencies: { readonly online: number[]; readonly all: number[] };  // seconds from writing to showing; online: both devices connected throughout
  readonly transmissions: number;
};

export function simulate(cfg: ChatConfig, protocol: Protocol): DeliveryResult {
  const world = new Rng(cfg.seed), net = new Rng(cfg.seed + 1);
  const stored = protocol !== 'push only', ids = protocol === 'stored, ids and sequence numbers';
  const devices: Device[] = [];
  cfg.devices.forEach((n, member) => {
    for (let k = 0; k < n; k++) {
      devices.push({ id: devices.length, member, skew: cfg.clockSkew * world.normal(), online: true, epoch: 0, lastSeq: 0, early: new Map(),
        resumeSentAt: -Infinity, shown: [], seen: [], outbox: new Map(), written: 0 });
    }
  });
  type Timed = { t: number; n: number; e: Event };
  const queue = new MinHeap<Timed>((a, b) => a.t < b.t || (a.t === b.t && a.n < b.n));
  let counter = 0, now = 0, transmissions = 0, nextId = 0;
  const at = (t: number, e: Event) => queue.push({ t, n: counter++, e });
  // A transmission over a connection: lost with probability `loss`, otherwise delayed. A connection
  // delivers in the order it was given messages, as TCP does, so `link` names the connection.
  const lastArrival = new Map<string, number>();
  const transmit = (e: Event, link: string) => {
    transmissions++;
    if (net.next() < cfg.loss) return;
    const t = Math.max(now + cfg.latency + net.exponential(1 / cfg.jitter), (lastArrival.get(link) ?? 0) + 1e-6);
    lastArrival.set(link, t);
    at(t, e);
  };
  const up = (d: Device) => `${d.id}:${d.epoch}:up`, down = (d: Device) => `${d.id}:${d.epoch}:down`;
  const log: Entry[] = [];                       // the server's copy, in sequence order
  const byClientId = new Map<number, Entry>();
  const nextFromDevice = devices.map(() => 1);   // the server keeps each device's messages in the order written
  const all: Message[] = [];
  const shownAt = new Map<string, number>();     // "device:clientId" -> first time shown
  const onlineSince: number[] = devices.map(() => 0);
  const connectedSpans: [number, number][][] = devices.map(() => []);

  for (const d of devices) at(world.exponential(1 / cfg.onlineMean), { kind: 'toggle', dev: d.id });
  cfg.devices.forEach((_, m) => at(world.exponential(1 / cfg.sendEvery), { kind: 'write', member: m }));

  const show = (d: Device, entry: Entry) => {
    if (entry.msg.device === d.id) return;       // the writer's device shows its own message at once
    d.shown.push(entry);
    d.seen.push([entry.msg.clientId, now]);
    const key = `${d.id}:${entry.msg.clientId}`;
    if (!shownAt.has(key)) shownAt.set(key, now);
  };
  const pushToAll = (entry: Entry) => {
    for (const d of devices) {
      // Push only has no single place that orders messages: the writer's gateway relays to each reader's.
      const link = stored ? down(d) : `${entry.msg.device}>${d.id}:${d.epoch}`;
      if (d.online && (stored || d.id !== entry.msg.device)) transmit({ kind: 'toDevice', dev: d.id, epoch: d.epoch, entries: [entry], newest: entry.seq }, link);
    }
  };
  const send = (d: Device, msg: Message) => {
    transmit({ kind: 'toServer', dev: d.id, epoch: d.epoch, msg }, up(d));
    if (stored) at(now + cfg.retryAfter, { kind: 'retry', dev: d.id, clientId: msg.clientId });
    else d.outbox.delete(msg.clientId);           // push only: sent once, forgotten
  };
  const resume = (d: Device) => {
    if (now - d.resumeSentAt < cfg.retryAfter) return;   // one request at a time, unless it was lost
    d.resumeSentAt = now;
    transmit({ kind: 'resume', dev: d.id, epoch: d.epoch, after: d.lastSeq }, up(d));
  };
  const receive = (d: Device, entries: Entry[], newest: number) => {
    if (!stored) { for (const e of entries) show(d, e); return; }
    for (const e of entries) if (e.seq > d.lastSeq) d.early.set(e.seq, e);
    while (d.early.has(d.lastSeq + 1)) {
      const e = d.early.get(d.lastSeq + 1) as Entry;
      d.early.delete(e.seq);
      d.lastSeq = e.seq;
      show(d, e);
    }
    // A gap, or a ping that names a newer message: something was lost. Ask for everything after the last shown.
    if (d.early.size > 0 || newest > d.lastSeq) resume(d);
  };

  let draining = false;
  while (queue.size > 0) {
    const { t, e } = queue.pop() as Timed;
    now = t;
    switch (e.kind) {
      case 'toggle': {
        const d = devices[e.dev] as Device;
        if (draining && d.online) break;
        d.online = !d.online;
        d.epoch++;
        d.resumeSentAt = -Infinity;
        d.early.clear();
        if (!d.online) {
          (connectedSpans[d.id] as [number, number][]).push([onlineSince[d.id] as number, now]);
          at(now + world.exponential(1 / cfg.offlineMean), { kind: 'toggle', dev: d.id });
          break;
        }
        onlineSince[d.id] = now;
        if (!draining) at(now + world.exponential(1 / cfg.onlineMean), { kind: 'toggle', dev: d.id });
        if (stored) { resume(d); at(now + cfg.heartbeat, { kind: 'ping', dev: d.id, epoch: d.epoch }); }
        for (const msg of [...d.outbox.values()]) send(d, msg);   // in the order written
        break;
      }
      case 'write': {
        if (now >= cfg.seconds) break;
        const own = devices.filter((d) => d.member === e.member);
        const live = own.filter((d) => d.online);
        const pool = live.length ? live : own;
        const d = pool[world.below(pool.length)] as Device;
        const coin = world.next();
        let replyTo = -1;
        if (coin < cfg.replyShare) {
          for (let i = d.seen.length - 1; i >= 0; i--) {
            const [id, when] = d.seen[i] as [number, number];
            if (when <= now - cfg.typing) { replyTo = id; break; }
          }
        }
        const msg: Message = { clientId: nextId++, device: d.id, deviceSeq: ++d.written, writtenAt: now, clock: now + d.skew, replyTo };
        all.push(msg);
        d.outbox.set(msg.clientId, msg);
        d.seen.push([msg.clientId, now]);
        if (d.online) send(d, msg);
        at(now + world.exponential(1 / cfg.sendEvery), { kind: 'write', member: e.member });
        break;
      }
      case 'toServer': {
        const d = devices[e.dev] as Device;
        if (!d.online || d.epoch !== e.epoch) break;
        if (!stored) { pushToAll({ seq: 0, msg: e.msg }); break; }
        const known = ids ? byClientId.get(e.msg.clientId) : undefined;
        if (known === undefined) {
          // With ids, a message that overtook an earlier one from the same device waits for its retry.
          if (ids && e.msg.deviceSeq !== nextFromDevice[d.id]) break;
          if (ids) nextFromDevice[d.id] = e.msg.deviceSeq + 1;
          const entry: Entry = { seq: log.length + 1, msg: e.msg };
          log.push(entry);
          byClientId.set(e.msg.clientId, entry);
          pushToAll(entry);
        }
        transmit({ kind: 'ack', dev: d.id, epoch: d.epoch, clientId: e.msg.clientId }, down(d));
        break;
      }
      case 'resume': {
        const d = devices[e.dev] as Device;
        if (!d.online || d.epoch !== e.epoch) break;
        transmit({ kind: 'toDevice', dev: d.id, epoch: d.epoch, entries: log.slice(e.after), newest: log.length }, down(d));
        break;
      }
      case 'ping': {
        const d = devices[e.dev] as Device;
        if (!d.online || d.epoch !== e.epoch) break;
        transmit({ kind: 'toDevice', dev: d.id, epoch: d.epoch, entries: [], newest: log.length }, down(d));
        if (!draining || d.lastSeq < log.length || devices.some((x) => x.outbox.size > 0)) at(now + cfg.heartbeat, { kind: 'ping', dev: d.id, epoch: d.epoch });
        break;
      }
      case 'toDevice': {
        const d = devices[e.dev] as Device;
        if (!d.online || d.epoch !== e.epoch) break;
        if (e.entries.length !== 1) d.resumeSentAt = -Infinity;   // the answer to a resume, or a ping
        receive(d, e.entries, e.newest);
        break;
      }
      case 'ack': {
        const d = devices[e.dev] as Device;
        if (d.online && d.epoch === e.epoch) d.outbox.delete(e.clientId);
        break;
      }
      case 'retry': {
        const d = devices[e.dev] as Device;
        const msg = d.outbox.get(e.clientId);
        if (msg && d.online) send(d, msg);       // offline: sent again on reconnect
        break;
      }
    }
    // After the writing stops, every device comes back and stays, so what is still missing is lost for good.
    if (!draining && now >= cfg.seconds) {
      draining = true;
      for (const d of devices) if (!d.online) at(now + world.exponential(1 / cfg.offlineMean), { kind: 'toggle', dev: d.id });
    }
  }

  // Score the run.
  for (const d of devices) if (d.online) (connectedSpans[d.id] as [number, number][]).push([onlineSince[d.id] as number, Infinity]);
  let expected = 0, missing = 0, duplicates = 0;
  const latOnline: number[] = [], latAll: number[] = [];
  for (const d of devices) {
    const count = new Map<number, number>();
    for (const e of d.shown) count.set(e.msg.clientId, (count.get(e.msg.clientId) ?? 0) + 1);
    for (const m of all) {
      if (m.device === d.id) continue;
      expected++;
      const c = count.get(m.clientId) ?? 0;
      if (c === 0) missing++;
      else duplicates += c - 1;
      const when = shownAt.get(`${d.id}:${m.clientId}`);
      if (when === undefined) continue;
      latAll.push(when - m.writtenAt);
      if (online(d.id, m.writtenAt, when) && online(m.device, m.writtenAt, when)) latOnline.push(when - m.writtenAt);
    }
  }
  // Was the device connected for the whole time from writing to showing? (Recorded from its toggles.)
  function online(dev: number, from: number, to: number): boolean {
    return connectedSpans[dev]?.some(([a, b]) => a <= from && to <= b) ?? false;
  }
  // Order: neighboring messages that another device shows the other way round.
  const position = devices.map((d) => {
    const p = new Map<number, number>();
    d.shown.forEach((e, i) => { if (!p.has(e.msg.clientId)) p.set(e.msg.clientId, i); });
    return p;
  });
  let orderDisagreements = 0;
  for (let a = 0; a < devices.length; a++) {
    for (let b = a + 1; b < devices.length; b++) {
      const A = position[a] as Map<number, number>, B = position[b] as Map<number, number>;
      const common = [...A.keys()].filter((k) => B.has(k)).sort((x, y) => (A.get(x) as number) - (A.get(y) as number));
      for (let i = 1; i < common.length; i++) {
        if ((B.get(common[i - 1] as number) as number) > (B.get(common[i] as number) as number)) orderDisagreements++;
      }
    }
  }
  // Replies shown above the message they answer: on any device, and if every device sorted by the writer's clock.
  const byId = new Map(all.map((m) => [m.clientId, m]));
  let replies = 0, aboveShown = 0, aboveByClock = 0;
  for (const m of all) {
    if (m.replyTo < 0) continue;
    const parent = byId.get(m.replyTo) as Message;
    replies++;
    if (m.clock < parent.clock) aboveByClock++;
    if (position.some((p) => p.has(m.clientId) && p.has(parent.clientId) && (p.get(m.clientId) as number) < (p.get(parent.clientId) as number))) aboveShown++;
  }
  return {
    protocol, messages: all.length, expected, missing, duplicates, orderDisagreements, replies,
    repliesAboveShown: aboveShown, repliesAboveByClock: aboveByClock, latencies: { online: latOnline, all: latAll }, transmissions,
  };
}
