// A simulated network: clients edit at random moments, and every message takes a random time to arrive,
// in order on each connection (one WebSocket each way). At the end, does every copy hold the same text?
import { Client, Server, type FromServer, type ToServer } from "./collab.ts";
import { deleteAt, insertAt } from "./ot.ts";
import { seeded } from "./rng.ts";

export interface SimOptions {
  readonly clients: number;
  readonly editsPerClient: number;
  readonly meanGapMs: number;        // average time between one client's edits
  readonly latencyMs: number;        // average one-way delay; each message takes 0.5 to 1.5 times this
  readonly seed: number;
  readonly transform: boolean;       // false: apply every edit at the position it was made, unchanged
  readonly start?: string;
}
export interface SimResult { readonly docs: string[]; readonly server: string; readonly converged: boolean; readonly ops: number; readonly transforms: number }

type Event = { at: number; seq: number; run: () => void };

export function simulate(o: SimOptions): SimResult {
  const random = seeded(o.seed);
  const queue: Event[] = [];
  let seq = 0;
  const at = (t: number, run: () => void) => {
    const e = { at: t, seq: seq++, run };
    let lo = 0, hi = queue.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; const q = queue[mid] as Event; if (q.at < t || (q.at === t && q.seq < e.seq)) lo = mid + 1; else hi = mid; }
    queue.splice(lo, 0, e);
  };
  const start = o.start ?? "The quick brown fox jumps over the lazy dog.";
  const server = new Server(start);
  const names = Array.from({ length: o.clients }, (_, i) => `c${i}`);
  const clients = names.map((n) => new Client(n, start, 0));
  const naive = names.map(() => start);
  let naiveServer = start;
  const up = names.map(() => 0), down = names.map(() => 0);          // last arrival on each connection, to keep order
  const delay = () => o.latencyMs * (0.5 + random());
  let ops = 0;

  const toServer = (k: number, now: number, m: ToServer | null) => {
    if (!m) return;
    up[k] = Math.max(now + delay(), (up[k] as number) + 0.001);
    at(up[k] as number, () => {
      const out = server.receive(m);
      ops += 1;
      for (let j = 0; j < o.clients; j += 1) toClient(j, up[k] as number, out);
    });
  };
  const toClient = (j: number, now: number, m: FromServer) => {
    down[j] = Math.max(now + delay(), (down[j] as number) + 0.001);
    at(down[j] as number, () => toServer(j, down[j] as number, (clients[j] as Client).receive(m)));
  };
  // naive copies: every edit is applied everywhere at the position where it was made, clamped to the text
  const naiveApply = (doc: string, pos: number, ins: string, del: number) => {
    const p = Math.min(pos, doc.length);
    return doc.slice(0, p) + ins + doc.slice(Math.min(doc.length, p + del));
  };

  names.forEach((_, k) => {
    let t = 0;
    for (let e = 0; e < o.editsPerClient; e += 1) {
      t += -Math.log(1 - random()) * o.meanGapMs;
      const r1 = random(), r2 = random(), r3 = random(), when = t;
      at(when, () => {
        const c = clients[k] as Client;
        const len = c.doc.length;
        const del = len > 0 && r1 < 0.3;
        const pos = Math.floor(r2 * (del ? len : len + 1));
        const n = Math.min(len - pos, 1 + Math.floor(r3 * 3));
        const text = "abcdefghij".slice(0, 1 + Math.floor(r3 * 3));
        toServer(k, when, c.edit(del ? deleteAt(len, pos, n) : insertAt(len, pos, text)));
        // the same intention without transformation
        const nv = naive[k] as string;
        const npos = Math.min(pos, nv.length);
        naive[k] = naiveApply(nv, npos, del ? "" : text, del ? n : 0);
        const arrive = when + delay();
        naiveServer = naiveApply(naiveServer, npos, del ? "" : text, del ? n : 0);
        names.forEach((__, j) => { if (j !== k) at(arrive + delay(), () => { naive[j] = naiveApply(naive[j] as string, npos, del ? "" : text, del ? n : 0); }); });
      });
    }
  });
  while (queue.length > 0) (queue.shift() as Event).run();
  if (!o.transform) return { docs: naive, server: naiveServer, converged: naive.every((d) => d === naive[0]), ops, transforms: 0 };
  const docs = clients.map((c) => c.doc);
  return { docs, server: server.doc, converged: docs.every((d) => d === server.doc), ops, transforms: server.transforms };
}
