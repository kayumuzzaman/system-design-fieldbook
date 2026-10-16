import { Rng } from './rng.ts';

// Delivery and read receipts in a group. Each member's phone connects now and then for a few minutes,
// and sometimes the member opens the chat. Two ways of reporting what a member has received and read:
// one receipt per message, or a watermark ("everything up to sequence 4,180") sent at most every few seconds.
export type ReceiptConfig = {
  readonly hours: number;
  readonly messagesPerDay: number;  // in the whole group, unless given
  readonly connectEvery: number;    // mean seconds between a member's connections
  readonly connectedFor: number;    // mean seconds connected
  readonly openShare: number;       // share of connections in which the member opens the chat
  readonly coalesce: number;        // a watermark is sent at most this often, in seconds
  readonly seed: number;
};

export const RECEIPTS: ReceiptConfig = { hours: 24, messagesPerDay: 200, connectEvery: 3_600, connectedFor: 300, openShare: 0.5, coalesce: 5, seed: 820 };

export type ReceiptRow = {
  readonly members: number;
  readonly messagesPerDay: number;
  readonly messages: number;
  readonly perMessage: number;   // receipts sent per message written, per member who could send one
  readonly watermark: number;
};

export function receipts(cfg: ReceiptConfig, members: number, messagesPerDay = cfg.messagesPerDay): ReceiptRow {
  const rng = new Rng(cfg.seed + members + messagesPerDay);
  const end = cfg.hours * 3_600;
  const times: number[] = [], writer: number[] = [];
  for (let t = rng.exponential(messagesPerDay / 86_400); t < end; t += rng.exponential(messagesPerDay / 86_400)) {
    times.push(t);
    writer.push(rng.below(members));
  }
  let perMessage = 0, watermark = 0;
  for (let m = 0; m < members; m++) {
    // This member's connections: [start, end, opens the chat]
    const sessions: [number, number, boolean][] = [];
    for (let t = rng.exponential(1 / cfg.connectEvery); t < end; ) {
      const stop = Math.min(end, t + rng.exponential(1 / cfg.connectedFor));
      sessions.push([t, stop, rng.next() < cfg.openShare]);
      t = stop + rng.exponential(1 / cfg.connectEvery);
    }
    // When each message reaches this member's device, and when the member sees it.
    let i = 0;
    // A watermark covers every message that arrived before it leaves. One leaves at most every
    // `coalesce` seconds: a message that arrives sooner waits for the next one, which then covers it.
    const delivered = { next: -Infinity }, read = { next: -Infinity };
    const mark = (w: { next: number }, t: number) => {
      if (t <= w.next) return;                       // the watermark already scheduled covers it
      w.next = Math.max(t, w.next + cfg.coalesce);
      watermark++;
    };
    let unread = 0;
    for (const [start, stop, opens] of sessions) {
      // On connecting, the backlog arrives at once: one receipt per message, or one watermark.
      let backlog = 0;
      while (i < times.length && (times[i] as number) < start) { if (writer[i] !== m) { backlog++; unread++; } i++; }
      perMessage += backlog;
      if (backlog > 0) mark(delivered, start);
      if (opens && unread > 0) { perMessage += unread; unread = 0; mark(read, start); }
      // While connected, messages arrive one by one, and are read at once if the chat is open.
      while (i < times.length && (times[i] as number) < stop) {
        const t = times[i] as number;
        if (writer[i] !== m) {
          perMessage++;
          mark(delivered, t);
          if (opens) { perMessage++; mark(read, t); } else unread++;
        }
        i++;
      }
    }
  }
  const per = times.length * (members - 1);
  return { members, messagesPerDay, messages: times.length, perMessage: perMessage / per, watermark: watermark / per };
}
