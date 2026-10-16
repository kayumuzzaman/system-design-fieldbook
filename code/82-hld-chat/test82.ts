import assert from 'node:assert/strict';
import { CHAT, PROTOCOLS, simulate } from './delivery.ts';
import type { DeliveryResult } from './delivery.ts';
import { RECEIPTS, receipts } from './receipts.ts';

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';
const q = (a: number[], x: number) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(x * s.length))] as number; };
const share = (a: number[], s: number) => a.filter((x) => x <= s).length / a.length;

// 1. Three delivery protocols on the same group, the same hour and the same devices.
const devices = CHAT.devices.reduce((a, b) => a + b, 0);
console.log(`group of ${CHAT.devices.length} members on ${devices} devices, one hour, a message every ${CHAT.sendEvery} s from each member;`);
console.log(`devices online ${CHAT.onlineMean} s and offline ${CHAT.offlineMean} s on average; ${pct(CHAT.loss, 0)} of transmissions lost; clocks off by ${CHAT.clockSkew} s (standard deviation)`);
const results: DeliveryResult[] = PROTOCOLS.map((p) => simulate(CHAT, p));
for (const r of results) {
  console.log(`\n${r.protocol}: ${r.messages.toLocaleString('en-US')} messages, ${r.expected.toLocaleString('en-US')} deliveries due (each message to every other device)`);
  console.log(`  never shown ${r.missing.toLocaleString('en-US')} (${pct(r.missing / r.expected)}), extra copies ${r.duplicates} (${pct(r.duplicates / r.expected)}), neighbors in opposite order on two devices ${r.orderDisagreements}`);
  console.log(`  replies shown above the message they answer: ${r.repliesAboveShown} of ${r.replies.toLocaleString('en-US')}; if sorted by the writer's clock: ${r.repliesAboveByClock}`);
  console.log(`  both devices connected throughout: median ${q(r.latencies.online, 0.5).toFixed(3)} s, ${pct(share(r.latencies.online, 1))} within 1 s, 99th percentile ${q(r.latencies.online, 0.99).toFixed(2)} s`);
  console.log(`  all deliveries: median ${q(r.latencies.all, 0.5).toFixed(3)} s, 99th percentile ${q(r.latencies.all, 0.99).toFixed(1)} s; transmissions ${r.transmissions.toLocaleString('en-US')}`);
}
const [push, noIds, full] = results as [DeliveryResult, DeliveryResult, DeliveryResult];
assert.ok(push.missing > 0 && push.orderDisagreements > 0);
assert.equal(noIds.missing, 0);
assert.ok(noIds.duplicates > 0);
assert.equal(full.missing, 0);
assert.equal(full.duplicates, 0);
assert.equal(full.orderDisagreements, 0);
assert.equal(full.repliesAboveShown, 0);
assert.ok(full.repliesAboveByClock > 0);
{
  const better = simulate({ ...CHAT, loss: 0.005 }, 'stored, ids and sequence numbers');
  console.log(`\nthe same with ${pct(0.005)} of transmissions lost: never shown ${better.missing}, extra copies ${better.duplicates}; both connected: ${pct(share(better.latencies.online, 1))} within 1 s, 99th percentile ${q(better.latencies.online, 0.99).toFixed(2)} s`);
}

// 2. Receipts: one per message, or a watermark at most every few seconds.
console.log(`\nreceipts in a group of 100, per message and per member; phones connect every ${RECEIPTS.connectEvery / 60} min for ${RECEIPTS.connectedFor / 60} min on average, chat opened in ${pct(RECEIPTS.openShare, 0)} of connections`);
console.log('  messages a day   one per message   watermark   times fewer');
for (const a of [20, 50, 200, 1_000, 5_000, 20_000]) {
  const r = receipts(RECEIPTS, 100, a);
  console.log(`  ${a.toLocaleString('en-US').padStart(15)} ${r.perMessage.toFixed(3).padStart(17)} ${r.watermark.toFixed(3).padStart(11)} ${(r.perMessage / r.watermark).toFixed(1).padStart(13)}`);
  assert.ok(r.watermark < r.perMessage);
}
console.log('\nall checks passed');
