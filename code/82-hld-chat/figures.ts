// Prints the data behind the chapter's charts as JSON: node lld/ts82/figures.ts > ch82/figures.json
import { CHAT, PROTOCOLS, simulate } from './delivery.ts';
import { RECEIPTS, receipts } from './receipts.ts';

const cdf = (a: number[], xs: number[]) => xs.map((x) => Number((a.filter((v) => v <= x).length / a.length).toFixed(4)));
const XS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
const delivery = PROTOCOLS.map((p) => {
  const r = simulate(CHAT, p);
  return { protocol: p, messages: r.messages, expected: r.expected, missing: r.missing, duplicates: r.duplicates, orderDisagreements: r.orderDisagreements,
    replies: r.replies, repliesAboveShown: r.repliesAboveShown, repliesAboveByClock: r.repliesAboveByClock,
    online: { n: r.latencies.online.length, cdf: cdf(r.latencies.online, XS) }, all: { n: r.latencies.all.length, cdf: cdf(r.latencies.all, XS) } };
});
const rows = [20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000].map((a) => receipts(RECEIPTS, 100, a));
console.log(JSON.stringify({ config: CHAT, xs: XS, delivery, receipts: { config: RECEIPTS, members: 100, rows } }));
