import assert from "node:assert/strict";
import { Sim } from "./sim.ts";
import { InventoryStore, key, reserve, STRATEGIES, type Strategy } from "./hotel.ts";
import { outcome } from "./overbook.ts";
import { MODES, simulate } from "./onsale.ts";
import { seeded } from "./random.ts";

const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

// --- a hotel: 50 rooms of one type, 7 nights, 5% overbooking allowed; 600 guests book at once
async function hotel(how: Strategy) {
  const sim = new Sim(), random = seeded(31);
  const store = new InventoryStore(sim, random, 0.05);
  for (let n = 0; n < 7; n += 1) store.rows.set(key("double", n), { total: 50, reserved: 0 });
  const stays: number[][] = [];
  const guests = Array.from({ length: 600 }, () => {
    const first = Math.floor(random() * 7), nights = 1 + Math.floor(random() * 4);
    return Array.from({ length: Math.min(nights, 7 - first) }, (_, i) => first + i);
  });
  const all = Promise.all(guests.map(async (nights, g) => {
    await sim.sleep(g * 0.01);                       // 600 requests within 6 ms
    if (await reserve(store, nights.map((n) => key("double", n)), how)) stays.push(nights);
  }));
  await sim.run();
  await all;
  const booked = Array(7).fill(0) as number[];
  for (const s of stays) for (const n of s) booked[n] = (booked[n] as number) + 1;
  let oversold = 0, counted = 0;
  for (let n = 0; n < 7; n += 1) {
    const row = store.rows.get(key("double", n)) as { total: number; reserved: number };
    oversold += Math.max(0, (booked[n] as number) - store.limit(row));   // stays promised beyond the limit
    counted += row.reserved;                                             // what the counters say
  }
  const roomNights = booked.reduce((a, b) => a + b, 0);
  return { how, stays: stays.length, roomNights, oversold, counted, phantom: counted - roomNights };
}
console.log("600 guests book stays of 1 to 4 nights at once; 50 rooms, at most 52 sold a night:");
for (const how of STRATEGIES) {
  const r = await hotel(how);
  console.log(`  ${how.padEnd(32)} ${fmt(r.stays)} stays, ${fmt(r.roomNights)} room-nights booked; ${r.oversold} beyond the limit; the counters say ${fmt(r.counted)}`);
  if (how === "all nights at once" || how === "night by night, undo on failure") { assert.equal(r.oversold, 0); assert.equal(r.phantom, 0); }
  if (how === "read, then write") assert.ok(r.oversold > 0);
  if (how === "night by night") { assert.equal(r.oversold, 0); assert.ok(r.phantom > 0); }
}

// --- overbooking: 100 rooms, 92% of reservations arrive
console.log("overbooking 100 rooms when 92% of guests arrive (exact, binomial):");
for (const pct of [0, 3, 5, 8, 10, 15]) {
  const o = outcome(100, pct, 0.92);
  console.log(`  +${String(pct).padStart(2)}%: ${o.accepted} accepted, ${o.emptyRooms.toFixed(2)} rooms empty, ${o.walkedGuests.toFixed(2)} guests without a room, ${(o.walkChance * 100).toFixed(1)}% of nights with any`);
}
{
  const random = seeded(5);
  let walked = 0, empty = 0;
  for (let night = 0; night < 100_000; night += 1) {
    let arrive = 0;
    for (let g = 0; g < 105; g += 1) if (random() < 0.92) arrive += 1;
    walked += Math.max(0, arrive - 100); empty += Math.max(0, 100 - arrive);
  }
  const o = outcome(100, 5, 0.92);
  assert.ok(Math.abs(walked / 100_000 - o.walkedGuests) < 0.02 && Math.abs(empty / 100_000 - o.emptyRooms) < 0.05);
  console.log(`  checked by 100,000 random nights at +5%: ${(walked / 100_000).toFixed(2)} without a room, ${(empty / 100_000).toFixed(2)} empty`);
}

// --- a sale everyone wants: 100,000 buyers and 500 scripted sessions for 20,000 tickets
console.log("on-sale: 20,000 tickets, 100,000 people, 500 bot sessions; booking service 200 orders a second:");
for (const mode of MODES) {
  const r = simulate(mode);
  console.log(`  ${mode}: ${fmt(r.soldToBuyers)} tickets reached buyers, the last at ${r.lastSaleAt} s; ${(r.wastedShare * 100).toFixed(1)}% of the work was for buyers who had left; ` +
    `${fmt(r.ticketsToBots)} tickets to bots; ${fmt(r.humansGaveUp)} people never got an answer; answer in ${r.medianAnswer} s (median), ${r.p90Answer} s (90th percentile); ${fmt(r.requests)} orders sent`);
  if (mode === "waiting room") { assert.equal(r.soldToBuyers, 20_000); assert.equal(r.humansGaveUp, 0); assert.equal(r.wastedShare, 0); }
}
console.log("ok");
