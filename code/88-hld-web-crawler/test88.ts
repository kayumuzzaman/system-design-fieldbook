import assert from "node:assert/strict";
import { normalize } from "./url.ts";
import { BloomFilter } from "./bloom.ts";
import { HostQueueFrontier } from "./frontier.ts";
import { crawl, type CrawlOptions } from "./crawl.ts";
import { article, seeded, SyntheticWeb } from "./web.ts";
import { distance, simhash } from "./simhash.ts";

// --- one page, many spellings
assert.equal(normalize("HTTPS://H5.Example:443/p/3#top"), "https://h5.example/p/3");
assert.equal(normalize("https://h5.example/p/3?utm_source=feed&b=2&a=1"), "https://h5.example/p/3?a=1&b=2");
assert.equal(normalize("https://h5.example/p/3?sid=8f2a"), "https://h5.example/p/3");
assert.equal(normalize("mailto:ana@example.com"), null);
assert.equal(normalize("not a url"), null);

// --- the Bloom filter: never a false "new", about 1% false "seen" when full
{
  const f = new BloomFilter(200_000, 0.01);
  for (let i = 0; i < 200_000; i += 1) f.add(`https://h${i % 977}.example/p/${i}`);
  for (let i = 0; i < 200_000; i += 997) assert.ok(f.mightContain(`https://h${i % 977}.example/p/${i}`));
  let fp = 0;
  for (let i = 0; i < 200_000; i += 1) if (f.mightContain(`https://other${i}.example/`)) fp += 1;
  console.log(`Bloom filter for 200,000 URLs at 1%: ${f.bytes().toLocaleString("en-US")} bytes (${((f.bytes() * 8) / 200_000).toFixed(1)} bits per URL), ${f.hashes} hashes; ${(fp / 2000).toFixed(2)}% of 200,000 unseen URLs reported as seen`);
  assert.ok(fp / 200_000 > 0.005 && fp / 200_000 < 0.015);
}

// --- the host-queue frontier hands out the host that is ready first, never one that is waiting
{
  const fr = new HostQueueFrontier(2);
  fr.add("a1", "a"); fr.add("a2", "a"); fr.add("b1", "b");
  const x = fr.next(0); fr.fetched("a", 0.5);
  const y = fr.next(0); fr.fetched("b", 0.4);
  const z = fr.next(0); // a may go again at 0.5 + 2
  assert.deepEqual([x?.url, y?.url, z?.url, z?.start], ["a1", "b1", "a2", 2.5]);
  fr.fetched("a", 3);
  assert.equal(fr.next(3), null);
}

// --- crawls of 20,000 pages from 50 seeds, 100 fetchers, 2 seconds between requests to a host
const web = new SyntheticWeb(5000);
const seeds = web.seeds(50);
const base: CrawlOptions = { frontier: "host-queues", fetchers: 100, delay: 2, maxPages: 20_000, seen: "set", normalize: true, hostBudget: null, seed: 1 };
const fmt = (r: ReturnType<typeof crawl>) => `${r.pagesPerSecond.toFixed(r.pagesPerSecond < 10 ? 2 : 0)} pages a second, ${r.impolite.toLocaleString("en-US")} impolite requests, ${r.hosts.toLocaleString("en-US")} hosts`;
{
  const polite = crawl(web, seeds, { ...base, frontier: "fifo" });
  const rude = crawl(web, seeds, { ...base, frontier: "fifo-impolite" });
  const hosts = crawl(web, seeds, base);
  console.log("20,000 pages, 100 fetchers, 2 s between requests to one host:");
  console.log(`  one queue, waiting for each host in turn: ${fmt(polite)}`);
  console.log(`  one queue, ignoring politeness:           ${fmt(rude)}`);
  console.log(`  a queue per host:                         ${fmt(hosts)}`);
  assert.equal(polite.impolite, 0);
  assert.equal(hosts.impolite, 0);
  assert.ok(rude.impolite > 10_000);
  assert.ok(hosts.pagesPerSecond > 100 * polite.pagesPerSecond);
  assert.equal(hosts.duplicateFetches, 0);
  console.log(`  identical content fetched again (mirrors): ${hosts.duplicateContent} of 20,000`);

  const raw = crawl(web, seeds, { ...base, normalize: false });
  console.log(`without normalizing URLs: ${raw.duplicateFetches.toLocaleString("en-US")} of 20,000 fetches were pages already fetched (${((raw.duplicateFetches / 20_000) * 100).toFixed(1)}%)`);
  assert.ok(raw.duplicateFetches > 2000);

  const known = hosts.fetched + hosts.queued;
  const bloom = crawl(web, seeds, { ...base, seen: "bloom", bloomItems: 55_000 });
  console.log(`a Bloom filter sized for 55,000 URLs at 1% (${bloom.bloomBytes.toLocaleString("en-US")} bytes) instead of a set: ${bloom.bloomSkipped} of about ${known.toLocaleString("en-US")} new URLs were wrongly skipped as seen`);
  assert.ok(bloom.bloomSkipped > 0 && bloom.bloomSkipped < known * 0.01);
}

// --- a crawler trap: an endless calendar, with and without a budget per host
{
  const trapSeed = ["https://calendar.example/day/0"];
  const endless = crawl(web, trapSeed, { ...base, fetchers: 10, maxPages: 2000 });
  const budget = crawl(web, trapSeed, { ...base, fetchers: 10, maxPages: 2000, hostBudget: 100 });
  console.log(`an endless calendar: ${endless.trap} pages fetched before the crawl's limit, ${endless.queued} still queued; with a budget of 100 URLs per host: ${budget.trap}, then nothing left`);
  assert.equal(endless.trap, 2000);
  assert.equal(budget.trap, 100);
  assert.equal(budget.queued, 0);
  console.log(`  politeness alone held it to ${endless.pagesPerSecond.toFixed(2)} pages a second: about ${Math.round(endless.pagesPerSecond * 86400).toLocaleString("en-US")} a day, for as long as the crawl runs`);
}

// --- near duplicates: SimHash distances for copies, edited copies and unrelated pages
{
  const r = seeded(5);
  const groups = { copy: [] as number[], edited: [] as number[], unrelated: [] as number[] };
  for (let i = 0; i < 1000; i += 1) {
    const a = article(i);
    const h = simhash(a);
    groups.copy.push(distance(h, simhash(a.concat(article(-1 - i, 12))))); // a print version: a new footer
    groups.edited.push(distance(h, simhash(a.map((w) => (r() < 0.05 ? `x${Math.floor(r() * 1e6)}` : w))))); // 5% of words changed
    groups.unrelated.push(distance(h, simhash(article(5000 + i))));
  }
  const within = (xs: number[], t: number) => xs.filter((x) => x <= t).length / xs.length;
  for (const t of [3, 10]) console.log(`SimHash, 64 bits, threshold ${t}: ${(within(groups.copy, t) * 100).toFixed(1)}% of copies with a new footer, ${(within(groups.edited, t) * 100).toFixed(1)}% of copies with 5% of words changed, ${(within(groups.unrelated, t) * 100).toFixed(1)}% of unrelated pages`);
  console.log(`  closest unrelated pair: ${Math.min(...groups.unrelated)} bits; farthest copy with a new footer: ${Math.max(...groups.copy)} bits`);
  assert.ok(Math.min(...groups.unrelated) > Math.max(...groups.copy));
}
console.log("all chapter 88 tests passed");
