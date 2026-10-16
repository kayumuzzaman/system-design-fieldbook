import assert from 'node:assert/strict';
import { scenarios, world } from './auth.ts';
import { OUTBOUND, OUTBOUND_POLICIES, runOutbound } from './outbound.ts';
import { MIX, storage } from './storage.ts';

const q = (a: number[], x: number) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(x * s.length))] as number; };
const min = (s: number) => (s / 60).toFixed(1) + ' min';

// 1. SPF, DKIM (Ed25519) and DMARC on six messages that all claim to come from the shop.
console.log('message                                  SPF   DKIM  DMARC  action');
const sc = scenarios(world());
for (const s of sc) console.log(`${s.name.padEnd(40)} ${s.verdict.spf.padEnd(5)} ${s.verdict.dkim.padEnd(5)} ${s.verdict.dmarc.padEnd(6)} ${s.verdict.action}`);
const by = new Map(sc.map((s) => [s.name, s.verdict]));
assert.equal(by.get('Sent by the shop’s own server')?.action, 'deliver');
assert.deepEqual(by.get('Forwarded unchanged'), { spf: 'fail', dkim: 'pass', dmarc: 'pass', action: 'deliver' });
assert.equal(by.get('Through a mailing list')?.dmarc, 'fail');
assert.equal(by.get('Forged From: address')?.action, 'reject');
assert.equal(by.get('Look-alike domain')?.dmarc, 'pass');

// 2. Outgoing mail while the largest receiving domain is unreachable for an hour.
console.log(`\noutbound: ${OUTBOUND.perSecond} messages a second for ${OUTBOUND.seconds / 3600} hours to ${OUTBOUND.domains} domains over ${OUTBOUND.connections} connections;`);
console.log(`the largest domain unreachable from ${min(OUTBOUND.outage.from)} to ${min(OUTBOUND.outage.to)}, each attempt held ${OUTBOUND.timeout} s; ${OUTBOUND.greylistShare * 100}% of domains greylist for ${min(OUTBOUND.greylistFor)}`);
const results = OUTBOUND_POLICIES.map((p) => runOutbound(OUTBOUND, p));
for (const r of results) {
  console.log(`\n${r.policy}: ${r.messages.toLocaleString('en-US')} messages, ${r.delivered.toLocaleString('en-US')} delivered, ${r.bounced.toLocaleString('en-US')} bounced, ${r.attempts.toLocaleString('en-US')} attempts`);
  console.log(`  connection time lost to timeouts ${(r.timeoutSeconds / 3600).toFixed(1)} hours`);
  console.log(`  other domains, submitted during the outage: median ${q(r.othersDuringOutage, 0.5).toFixed(1)} s, 99th percentile ${q(r.othersDuringOutage, 0.99).toFixed(0)} s`);
  console.log(`  greylisting domains: median ${min(q(r.delays.greylisted, 0.5))}, 99th percentile ${min(q(r.delays.greylisted, 0.99))}`);
  console.log(`  the unreachable domain, after it recovered: median ${min(q(r.afterRecovery, 0.5))}, last ${min(q(r.afterRecovery, 1))}`);
}
const [fixed, , limited] = results as [typeof results[0], typeof results[0], typeof results[0]];
assert.ok(q(limited.othersDuringOutage, 0.99) < q(fixed.othersDuringOutage, 0.99) / 10);
assert.ok(limited.timeoutSeconds < fixed.timeoutSeconds / 100);

// 3. Storing attachments once.
const st = storage(MIX);
console.log(`\nstorage: ${MIX.messages.toLocaleString('en-US')} messages, ${st.deliveries.toLocaleString('en-US')} copies in mailboxes; attachments ${(st.attachmentShare * 100).toFixed(1)}% of the bytes`);
console.log(`  a full copy per mailbox ${(st.perRecipient / 1e9).toFixed(1)} GB; each distinct attachment once ${(st.singleInstance / 1e9).toFixed(1)} GB (${(st.singleInstance / st.perRecipient * 100).toFixed(1)}%)`);
assert.ok(st.singleInstance < st.perRecipient);
console.log('\nall checks passed');
