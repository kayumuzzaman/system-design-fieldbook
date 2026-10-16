import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

// A small model of how a receiving server decides whether mail claiming to be from a domain is genuine.
// SPF asks whether the connecting address may send for the envelope's domain. DKIM checks a signature
// over the headers and body with a public key published by the signing domain. DMARC passes when either
// passes for a domain aligned with the visible From: domain, and says what to do otherwise.
// Simplifications: SPF records list addresses only; the organizational domain is the last two labels
// (RFC 9989 finds it with a DNS tree walk); one DKIM signature per message.

export type Dns = Map<string, string>;              // name -> TXT record

export type Message = {
  readonly connectingIp: string;                   // the address of the server delivering it to us
  readonly mailFrom: string;                       // the envelope sender (where bounces go)
  readonly headers: Readonly<Record<string, string>>;   // from, to, subject, date
  readonly body: string;
  readonly dkim?: DkimSignature;
};
export type DkimSignature = { readonly d: string; readonly s: string; readonly h: readonly string[]; readonly bh: string; readonly b: string };
export type Result = 'pass' | 'fail' | 'none';

// The domain of an address, written plainly or in a display form such as "Shop <orders@shop.example>".
const domainOf = (address: string) => (address.match(/<([^>]*)>/)?.[1] ?? address).trim().split('@').pop()?.toLowerCase() ?? '';
export const organizational = (domain: string) => domain.split('.').slice(-2).join('.');

// SPF: "v=spf1 ip4:203.0.113.5 ip4:203.0.113.6 -all"
export function spf(dns: Dns, m: Message): Result {
  const record = dns.get(domainOf(m.mailFrom));
  if (!record?.startsWith('v=spf1')) return 'none';
  const allowed = record.split(' ').filter((t) => t.startsWith('ip4:')).map((t) => t.slice(4));
  return allowed.includes(m.connectingIp) ? 'pass' : 'fail';
}

// DKIM, with "relaxed" canonicalization: header names lowercased, runs of spaces collapsed, trailing
// spaces and empty lines at the end of the body removed. Ed25519 signatures (RFC 8463).
const canonHeader = (name: string, value: string) => `${name.toLowerCase()}:${value.replace(/\s+/g, ' ').trim()}`;
const canonBody = (body: string) => body.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').replace(/ $/, '')).join('\n').replace(/\n*$/, '\n');
const bodyHash = (body: string) => createHash('sha256').update(canonBody(body)).digest('base64');
const signedData = (m: Message, d: string, s: string, h: readonly string[], bh: string) =>
  h.map((name) => canonHeader(name, m.headers[name] ?? '')).join('\r\n') + `\r\ndkim-signature:d=${d}; s=${s}; h=${h.join(':')}; bh=${bh}; b=`;

export function dkimSign(m: Message, d: string, s: string, key: KeyObject): Message {
  const h = ['from', 'to', 'subject', 'date'];
  const bh = bodyHash(m.body);
  const b = sign(null, Buffer.from(signedData(m, d, s, h, bh)), key).toString('base64');
  return { ...m, dkim: { d, s, h, bh, b } };
}

export function dkim(dns: Dns, m: Message): Result {
  if (!m.dkim) return 'none';
  const { d, s, h, bh, b } = m.dkim;
  const record = dns.get(`${s}._domainkey.${d}`);                  // "v=DKIM1; k=ed25519; p=<key>"
  const p = record?.match(/p=([^;]+)/)?.[1];
  if (!p) return 'fail';
  if (bodyHash(m.body) !== bh) return 'fail';                     // the body changed on the way
  const key = { key: Buffer.from(p, 'base64'), format: 'der' as const, type: 'spki' as const };
  return verify(null, Buffer.from(signedData(m, d, s, h, bh)), key, Buffer.from(b, 'base64')) ? 'pass' : 'fail';
}

export type Verdict = { readonly spf: Result; readonly dkim: Result; readonly dmarc: 'pass' | 'fail' | 'none'; readonly action: 'deliver' | 'quarantine' | 'reject' };

// DMARC: "v=DMARC1; p=reject" at _dmarc.<From: domain>. Relaxed alignment: same organizational domain.
export function evaluate(dns: Dns, m: Message): Verdict {
  const from = domainOf(m.headers['from'] ?? '');
  const s = spf(dns, m), k = dkim(dns, m);
  const record = dns.get(`_dmarc.${from}`) ?? dns.get(`_dmarc.${organizational(from)}`);
  const aligned = (d: string) => organizational(d) === organizational(from);
  const pass = (s === 'pass' && aligned(domainOf(m.mailFrom))) || (k === 'pass' && aligned(m.dkim?.d ?? ''));
  if (!record?.startsWith('v=DMARC1')) return { spf: s, dkim: k, dmarc: 'none', action: 'deliver' };
  const policy = record.match(/p=(\w+)/)?.[1] ?? 'none';
  const action = pass || policy === 'none' ? 'deliver' : policy === 'reject' ? 'reject' : 'quarantine';
  return { spf: s, dkim: k, dmarc: pass ? 'pass' : 'fail', action };
}

// A small internet with a shop, an email service that sends its newsletters, a forwarder, a mailing list
// and an impostor who registered a look-alike domain.
export type World = { readonly dns: Dns; readonly keys: Map<string, KeyObject> };

export function world(): World {
  const dns: Dns = new Map();
  const keys = new Map<string, KeyObject>();
  const publish = (domain: string, selector: string) => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const p = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    dns.set(`${selector}._domainkey.${domain}`, `v=DKIM1; k=ed25519; p=${p}`);
    keys.set(`${selector}._domainkey.${domain}`, privateKey);
  };
  dns.set('shop.example', 'v=spf1 ip4:198.51.100.10 -all');
  dns.set('_dmarc.shop.example', 'v=DMARC1; p=reject');
  publish('shop.example', 'mail');
  publish('shop.example', 'esp');                        // a key the shop lets its email service use
  dns.set('bounces.esp.example', 'v=spf1 ip4:203.0.113.20 -all');
  dns.set('lists.example', 'v=spf1 ip4:192.0.2.30 -all');
  dns.set('shop-example.com', 'v=spf1 ip4:233.252.0.66 -all');
  dns.set('_dmarc.shop-example.com', 'v=DMARC1; p=reject');
  publish('shop-example.com', 'k1');
  return { dns, keys };
}

export type Scenario = { readonly name: string; readonly message: Message; readonly verdict: Verdict };

export function scenarios(w: World): Scenario[] {
  const base: Message = {
    connectingIp: '198.51.100.10', mailFrom: 'orders@shop.example',
    headers: { from: 'Shop <orders@shop.example>', to: 'ben@mail.example', subject: 'Your order 81723 has shipped', date: 'Tue, 13 Oct 2026 08:12:31 +0000' },
    body: 'Hello Ben,\nYour order is on its way.\n',
  };
  const key = (name: string) => w.keys.get(name) as KeyObject;
  const signed = dkimSign(base, 'shop.example', 'mail', key('mail._domainkey.shop.example'));
  const list: Message[] = [
    signed,
    // Forwarded unchanged by the recipient's old address: same envelope, a different connecting server.
    { ...signed, connectingIp: '192.0.2.77' },
    // A mailing list tags the subject and adds a footer, and sends with its own envelope.
    { ...signed, connectingIp: '192.0.2.30', mailFrom: 'list-bounces@lists.example', headers: { ...signed.headers, subject: '[deals] ' + signed.headers['subject'] }, body: signed.body + '--\nTo leave the list, reply STOP\n' },
    // A newsletter sent by an email service from its own servers, signed with a key the shop delegated.
    dkimSign({ ...base, connectingIp: '203.0.113.20', mailFrom: 'b-81723@bounces.esp.example', headers: { ...base.headers, subject: 'Autumn offers' } }, 'shop.example', 'esp', key('esp._domainkey.shop.example')),
    // A forger: the shop's name in From:, a server the shop never authorized, no signature.
    { ...base, connectingIp: '233.252.0.66', headers: { ...base.headers, subject: 'Payment failed: update your card' } },
    // The same forger, from a look-alike domain it owns and has set up correctly.
    dkimSign({ ...base, connectingIp: '233.252.0.66', mailFrom: 'billing@shop-example.com', headers: { ...base.headers, from: 'Shop <billing@shop-example.com>', subject: 'Payment failed: update your card' } }, 'shop-example.com', 'k1', key('k1._domainkey.shop-example.com')),
  ];
  const names = ['Sent by the shop’s own server', 'Forwarded unchanged', 'Through a mailing list', 'Sent by an email service for the shop', 'Forged From: address', 'Look-alike domain'];
  return list.map((message, i) => ({ name: names[i] as string, message, verdict: evaluate(w.dns, message) }));
}
