import assert from "node:assert/strict";
import { encode, decode, spaceOf } from "./base62.ts";
import { Rng } from "./rng.ts";
import { createRandom, createHashed, hashCode, type CodeTable } from "./keys.ts";
import { Redirector, ClickBuffer, type Link, type LinkStore, type Click } from "./redirect.ts";
import * as X from "./experiments.ts";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");

class MapTable implements CodeTable {
  readonly rows = new Map<string, string>();
  insertIfAbsent(code: string, longUrl: string): boolean {
    if (this.rows.has(code)) return false;
    this.rows.set(code, longUrl);
    return true;
  }
  get(code: string): string | undefined {
    return this.rows.get(code);
  }
}

// ---------------------------------------------------------------- base 62
assert.equal(spaceOf(7), 3_521_614_606_208);
assert.equal(encode(0), "0000000");
assert.equal(encode(61, 1), "z");
assert.equal(encode(spaceOf(7) - 1), "zzzzzzz");
assert.throws(() => encode(spaceOf(7)));
const rng = new Rng(11);
for (let i = 0; i < 10_000; i++) {
  const n = rng.below(spaceOf(7));
  assert.equal(decode(encode(n)), n);
}
console.log(`base 62: 6 characters ${n0(spaceOf(6))}, 7 characters ${n0(spaceOf(7))}, 8 characters ${n0(spaceOf(8))}`);
console.log(`base 62: 125 is ${encode(125)}, 1,000,000 is ${encode(1_000_000)}, the last 7-character code is ${encode(spaceOf(7) - 1)}`);

// ---------------------------------------------------------------- random codes with a uniqueness check
{
  const table = new MapTable();
  let attempts = 0;
  for (let i = 0; i < 100_000; i++) attempts += createRandom(table, `https://example.com/${i}`, rng, 4).attempts;
  assert.equal(table.rows.size, 100_000);
  console.log(`random, 4 characters: 100,000 links in ${n0(spaceOf(4))} codes took ${n0(attempts)} attempts, ${(attempts / 100_000).toFixed(3)} each`);
  const tiny = new MapTable();
  for (let i = 0; i < 62; i++) tiny.insertIfAbsent(encode(i, 1), "x");
  assert.throws(() => createRandom(tiny, "https://example.com/full", rng, 1), /too full/);
}

// ---------------------------------------------------------------- hashed codes
{
  const table = new MapTable();
  const a = createHashed(table, "https://example.com/a");
  const again = createHashed(table, "https://example.com/a");
  assert.equal(a.code, again.code);
  assert.equal(again.reused, true);
  // Find a URL whose first 1-character hash lands on the same code as another, and watch it move on.
  const small = new MapTable();
  const first = createHashed(small, "https://example.com/0", 1);
  let other = 1;
  while (hashCode(`https://example.com/${other}`, 0, 1) !== first.code) other++;
  const moved = createHashed(small, `https://example.com/${other}`, 1);
  assert.notEqual(moved.code, first.code);
  console.log(`hashed: the same URL twice gives ${a.code} both times; a colliding URL took attempt ${moved.attempts} and got ${moved.code}`);
}

// ---------------------------------------------------------------- the simulations that run quickly
{
  const r = X.firstRepeat();
  console.log(`first repeat, 4 characters (${n0(r.N)} codes), ${r.trials} trials: median ${n0(r.median)} codes (formula ${n0(r.halfByFormula)}), mean ${n0(r.mean)} (formula ${n0(Math.sqrt((Math.PI * r.N) / 2))})`);
  for (const p of r.points) if (p.n % 2000 === 0) console.log(`  by ${n0(p.n)} codes: a repeat in ${pct(p.measured)} of trials, formula ${pct(p.formula)}`);
  const N7 = spaceOf(7);
  console.log(`7 characters: 50% chance of a repeat after ${n0(Math.sqrt(2 * N7 * Math.log(2)))} codes, which is ${(Math.sqrt(2 * N7 * Math.log(2)) / (100_000_000 / 86_400) / 60).toFixed(0)} minutes of writes at 100 million a day`);
}
{
  for (const r of X.retriesByFill()) {
    console.log(`fill ${pct(r.fill, 0)}: ${r.mean.toFixed(3)} attempts per insert (formula ${r.formula.toFixed(3)}), most ${r.most}, 3 or more attempts ${pct(r.threeOrMore, 2)} (formula ${pct(r.threeOrMoreFormula, 2)})`);
  }
}
{
  const r = X.hashVersusRandom();
  console.log(`hash against random, ${n0(r.urls)} links in ${n0(r.N)} codes, ${r.sets} sets: equal pairs ${r.hashed.toFixed(2)} hashed, ${r.random.toFixed(2)} random, formula ${r.formula.toFixed(2)}`);
}
{
  for (const r of X.counterRanges()) {
    assert.equal(r.duplicates, 0);
    console.log(`ranges of ${n0(r.size)}: ${n0(r.leases)} leases, ${r.leasesPerSecond.toFixed(3)} a second at 1,157 links a second; 40 restarts wasted ${n0(r.wasted)} values, ${pct(r.wastedShare, 2)} of the 10,000,000 issued; duplicates ${r.duplicates}`);
  }
}
{
  const p = X.scramblerIsPermutation();
  assert.equal(p.repeats, 0);
  const c = X.counting();
  assert.equal(c.scrambledDistinct, c.issuedCount);
  console.log(`scrambler: all ${n0(p.space)} values of a 4-character space map to different values (repeats ${p.repeats})`);
  console.log(`scrambler: counter values 0 to 4 become ${c.firstFive.map((x) => encode(x)).join(", ")}`);
  console.log(`counting: of the ${c.tries} codes after a known one, ${c.plainHits} are links with a plain counter and ${c.scrambledHits} with a scrambled one (${n0(c.issuedCount)} links issued)`);
}
{
  const a = X.aggregation();
  console.log(`clicks: ${n0(a.perSecond)} a second, the most popular link gets ${n0(a.hottestPerSecond)} a second`);
  for (const w of a.windows) console.log(`  counted in windows of ${w.seconds} s: ${n0(w.writesPerSecond)} counter writes a second (${(a.perSecond / w.writesPerSecond).toFixed(1)} times fewer)`);
}
{
  for (const r of X.stackDistanceAgrees()) assert.equal(r.onePass, r.lruClass);
  console.log("one-pass LRU method: identical hits to the LRU class at sizes 10, 100, 1,000 and 5,000");
}

// ---------------------------------------------------------------- the redirect path
{
  const links = new Map<string, Link>();
  let reads = 0;
  const store: LinkStore = {
    async get(code) {
      reads++;
      return links.get(code);
    },
  };
  const sent: Click[][] = [];
  let failing = false;
  const buffer = new ClickBuffer(async (batch) => {
    if (failing) throw new Error("analytics is down");
    sent.push(batch);
  });
  const r = new Redirector(store, buffer, 1000);
  links.set("aZ3kQ9x", { code: "aZ3kQ9x", longUrl: "https://example.com/a", expiresAt: null, disabled: false });

  let reply = await r.redirect("aZ3kQ9x", 0);
  assert.equal(reply.status, 301);
  assert.equal(reply.headers.Location, "https://example.com/a");
  assert.equal(reply.headers["Cache-Control"], "private, max-age=60");
  await r.redirect("aZ3kQ9x", 30_000);
  assert.equal(reads, 1); // the second came from the cache
  await r.redirect("aZ3kQ9x", 61_000);
  assert.equal(reads, 2); // the entry had lived its minute

  assert.equal((await r.redirect("nope123", 0)).status, 404);
  await r.redirect("nope123", 1000);
  assert.equal(reads, 3); // the miss was remembered for a few seconds
  await r.redirect("nope123", 6000);
  assert.equal(reads, 4);

  links.set("exp0001", { code: "exp0001", longUrl: "https://example.com/sale", expiresAt: 100_000, disabled: false });
  assert.equal((await r.redirect("exp0001", 70_000)).headers["Cache-Control"], "private, max-age=30");
  assert.equal((await r.redirect("exp0001", 100_000)).status, 410); // expired, though still cached

  links.set("aZ3kQ9x", { ...links.get("aZ3kQ9x")!, disabled: true });
  assert.equal((await r.redirect("aZ3kQ9x", 62_000)).status, 301); // the cached copy still says active
  r.forget("aZ3kQ9x");
  assert.equal((await r.redirect("aZ3kQ9x", 62_001)).status, 410);

  assert.equal(buffer.waiting, 5);
  failing = true;
  assert.equal(await buffer.flush(), 0);
  assert.equal(buffer.waiting, 5); // kept for the next try
  failing = false;
  assert.equal(await buffer.flush(), 5);
  assert.equal(sent.flat().length, 5);

  const hanging = new ClickBuffer(() => new Promise<void>(() => {}));
  const r2 = new Redirector(store, hanging, 10);
  links.set("ok00001", { code: "ok00001", longUrl: "https://example.com/ok", expiresAt: null, disabled: false });
  await r2.redirect("ok00001", 0);
  void hanging.flush(); // never finishes
  assert.equal((await r2.redirect("ok00001", 1)).status, 301);

  const bounded = new ClickBuffer(async () => {}, 3);
  for (let i = 0; i < 5; i++) bounded.add({ code: "x", at: i, referrer: null });
  assert.equal(bounded.dropped, 2);
  console.log("redirect: cached for 60 s, misses remembered for 5 s, 410 after expiry or once forgotten, clicks kept while analytics is down, a hung analytics call never delays a redirect");
}
console.log("all tests passed");
