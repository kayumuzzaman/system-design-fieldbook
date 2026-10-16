import { seeded } from "./random.ts";
import { NodeHeap } from "./heap.ts";

// The first minutes of a sale that everyone wants: far more buyers than tickets, arriving at once.
// The booking service can process `capacity` orders a second, one at a time in arrival order.
// A buyer's app gives up on a request after `timeout` seconds and tries again a little later.
export interface Config {
  tickets: number; humans: number; botSessions: number; botAccounts: number;
  capacity: number; timeout: number; humanTries: number; holdSeconds: number; admitShare: number;
}
export const DEFAULT: Config = {
  tickets: 20_000, humans: 100_000, botSessions: 500, botAccounts: 50,
  capacity: 200, timeout: 10, humanTries: 10, holdSeconds: 600, admitShare: 0.9,
};
export type Mode = "no waiting room" | "no waiting room, stale requests dropped" | "waiting room";
export const MODES: Mode[] = ["no waiting room", "no waiting room, stale requests dropped", "waiting room"];

export interface Result {
  mode: Mode;
  lastSaleAt: number;        // seconds after opening when the last ticket went to a buyer who got it
  ticketsToBots: number;
  wastedShare: number;       // share of processed orders whose buyer had already given up
  humansBought: number;
  humansToldSoldOut: number;
  humansGaveUp: number;      // never got an answer
  medianAnswer: number;      // seconds from a human's arrival to an answer, among those answered
  p90Answer: number;
  requests: number;          // orders sent to the booking service
  soldToBuyers: number;      // tickets that reached a buyer who was still there
  series: { t: number; sold: number }[];   // tickets sold to present buyers, every 5 seconds for 4 minutes
}

interface Client { arrive: number; bot: boolean; tries: number; bought: number; answeredAt: number }

function arrivals(c: Config, random: () => number): Client[] {
  const clients: Client[] = [];
  for (let i = 0; i < c.humans; i += 1) {
    const r = random();
    // 30% wait on the page before the opening, 50% come in the first minute, 20% later on
    const arrive = r < 0.3 ? -900 * random() : r < 0.8 ? 60 * random() : 60 - 180 * Math.log(1 - random());
    clients.push({ arrive, bot: false, tries: 0, bought: 0, answeredAt: NaN });
  }
  return clients;
}
const percentile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))] ?? NaN; };

export function simulate(mode: Mode, c: Config = DEFAULT, seed = 1): Result {
  const random = seeded(seed);
  const clients = arrivals(c, random);
  let tickets = c.tickets, toBots = 0, wasted = 0, processed = 0, requests = 0, lastSale = 0;
  const sales: number[] = [];
  const sell = (cl: Client, t: number) => { tickets -= 1; cl.bought += 1; if (cl.bot) toBots += 1; lastSale = t; sales.push(t); };

  if (mode === "waiting room") {
    // One place per account. Those who came early are shuffled at the opening; later arrivals queue in order.
    for (let b = 0; b < c.botAccounts; b += 1) clients.push({ arrive: -60 * random(), bot: true, tries: 0, bought: 0, answeredAt: NaN });
    const early = clients.filter((x) => x.arrive < 0), late = clients.filter((x) => x.arrive >= 0).sort((a, b) => a.arrive - b.arrive);
    for (let i = early.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [early[i], early[j]] = [early[j] as Client, early[i] as Client]; }
    const rate = c.capacity * c.admitShare;
    let soldOutAt = Infinity, k = 0;
    for (const cl of [...early, ...late]) {
      const at = Math.max(cl.arrive, k / rate);
      if (at >= soldOutAt || tickets === 0) { soldOutAt = Math.min(soldOutAt, at); cl.answeredAt = Math.max(cl.arrive, soldOutAt); continue; }
      k += 1;
      const wants = cl.bot ? 4 : 1;                 // the per-order limit
      requests += 1; processed += 1;
      for (let w = 0; w < wants && tickets > 0; w += 1) sell(cl, at);
      cl.answeredAt = at;
      if (tickets === 0) soldOutAt = at;
    }
  } else {
    for (let b = 0; b < c.botSessions; b += 1) clients.push({ arrive: 0.05 * random(), bot: true, tries: 0, bought: 0, answeredAt: NaN });
    const events = new NodeHeap();
    clients.forEach((cl, i) => events.push(cl.bot ? cl.arrive : Math.max(cl.arrive, 2 * random()), i));   // early birds click at the opening
    const orphans: number[] = [];                   // expiry times of holds whose buyer left, in order
    let head = 0, free = 0;
    const service = 1 / c.capacity;
    while (events.size > 0) {
      const t = events.topKey(), i = events.pop();
      const cl = clients[i] as Client;
      requests += 1; cl.tries += 1;
      const start = Math.max(t, free);
      const stale = start + 1 / c.capacity - t > c.timeout - 0.5;   // cannot finish before the buyer gives up
      let answered = false;
      if (!(stale && mode === "no waiting room, stale requests dropped")) {
        const done = start + service;
        free = done; processed += 1;
        while (head < orphans.length && (orphans[head] as number) <= done) { head += 1; tickets += 1; }   // abandoned holds expire
        if (done - t > c.timeout) {
          wasted += 1;                              // the buyer has gone: any ticket held for them is stuck until the hold expires
          if (tickets > 0) { tickets -= 1; orphans.push(done + c.holdSeconds); }
        } else if (tickets > 0) {
          sell(cl, done); answered = true;
          if (cl.bot && cl.bought < 4) { events.push(done + 0.2, i); continue; }   // a script orders again at once
          cl.answeredAt = done;
        } else { cl.answeredAt = done; answered = true; }
      }
      if (!answered) {                                // timed out: try again after a pause, if still willing
        const pause = cl.bot ? 0.2 : 2 + 8 * random();
        if (cl.bot || cl.tries < c.humanTries) events.push(t + c.timeout + pause, i);
      }
    }
  }
  const humans = clients.filter((x) => !x.bot);
  const answered = humans.filter((x) => !Number.isNaN(x.answeredAt));
  const waits = answered.map((x) => x.answeredAt - Math.max(0, x.arrive));
  const series: { t: number; sold: number }[] = [];
  let s = 0;
  for (let t = 0; t <= 240; t += 5) { while (s < sales.length && (sales[s] as number) <= t) s += 1; series.push({ t, sold: s }); }
  return {
    mode, lastSaleAt: Math.round(lastSale), ticketsToBots: toBots, wastedShare: processed ? wasted / processed : 0,
    humansBought: humans.filter((x) => x.bought > 0).length,
    humansToldSoldOut: answered.length - humans.filter((x) => x.bought > 0).length,
    humansGaveUp: humans.length - answered.length,
    medianAnswer: Math.round(percentile(waits, 0.5)), p90Answer: Math.round(percentile(waits, 0.9)),
    requests, soldToBuyers: sales.length, series,
  };
}
