// Prints the data behind the chapter's chart as JSON: `node figures.ts > figures.json`
// The same day of sales for 20 seeded crowds, at each hold time, averaged.
import { customers, simulate } from "./simulate.ts";

const SEEDS = 20, HOLDS = [1, 2, 3, 5, 7, 10, 15, 20, 30];
const rows = [];
for (const holdMinutes of HOLDS) {
  const sum = { ranOutOfTime: 0, turnedAwayByAbandoned: 0, refunded: 0, lateAnswers: 0, seatsSold: 0, soldOutBy120: 0, soldOutMinute: 0 };
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const r = await simulate({ holdMinutes, policy: "grace", customers: customers(1000, 120, seed), minutes: 120, check: false });
    sum.ranOutOfTime += r.ranOutOfTime;
    sum.turnedAwayByAbandoned += r.turnedAwayByAbandoned;
    sum.refunded += r.refunded;
    sum.lateAnswers += r.lateAnswers;
    sum.seatsSold += r.seatsSold;
    if (r.soldOutMinute !== null) { sum.soldOutBy120 += 1; sum.soldOutMinute += r.soldOutMinute; }
  }
  const avg = (x: number) => Math.round((x / SEEDS) * 10) / 10;
  rows.push({
    holdMinutes,
    ranOutOfTime: avg(sum.ranOutOfTime), // customers whose hold lapsed before they pressed pay
    turnedAwayByAbandoned: avg(sum.turnedAwayByAbandoned), // turned away while abandoned holds sat on enough seats
    refunded: avg(sum.refunded),
    lateAnswers: avg(sum.lateAnswers),
    seatsSold: avg(sum.seatsSold),
    soldOutBy120: sum.soldOutBy120, // of SEEDS days
    soldOutMinute: sum.soldOutBy120 ? Math.round((sum.soldOutMinute / sum.soldOutBy120) * 10) / 10 : null, // over the days that sold out
  });
}
console.log(JSON.stringify({ seeds: SEEDS, customers: 1000, minutes: 120, seats: 100, rows }));
