// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json` (about 30 s)
import { crawl, type CrawlOptions } from "./crawl.ts";
import { HostQueueFrontier } from "./frontier.ts";
import { article, seeded, SyntheticWeb } from "./web.ts";
import { distance, simhash } from "./simhash.ts";

// fig-frontier: three hosts, three fetchers, fixed fetch times, 2 s between requests to a host
const fr = new HostQueueFrontier(2);
const took: Record<string, number> = { news: 0.5, blog: 0.3, shop: 0.7 };
for (const [h, n] of [["news", 3], ["blog", 2], ["shop", 2]] as const) for (let i = 1; i <= n; i += 1) fr.add(`${h}/${i}`, h);
const free = [0, 0, 0];
const trace = [];
for (let k = 0; k < 5; k += 1) {
  const f = free.indexOf(Math.min(...free));
  const n = fr.next(free[f] as number);
  if (!n) break;
  const end = n.start + (took[n.host] as number);
  fr.fetched(n.host, end);
  free[f] = end;
  trace.push({ fetcher: f + 1, url: n.url, host: n.host, asked: n.start, start: n.start, end, readyAgain: end + 2 });
}

// fig-politeness: pages a second by number of fetchers, 10,000 pages each
const web = new SyntheticWeb(5000);
const seeds = web.seeds(50);
const base: CrawlOptions = { frontier: "host-queues", fetchers: 100, delay: 2, maxPages: 10_000, seen: "set", normalize: true, hostBudget: null, seed: 1 };
const sweep = [5, 10, 25, 50, 100, 200, 400, 800].map((fetchers) => {
  const row: Record<string, number> = { fetchers };
  for (const f of ["fifo", "fifo-impolite", "host-queues"] as const) {
    const r = crawl(web, seeds, { ...base, fetchers, frontier: f });
    row[f] = Math.round(r.pagesPerSecond * 100) / 100;
    if (f === "fifo-impolite") row.impoliteShare = Math.round((r.impolite / r.fetched) * 1000) / 1000;
  }
  return row;
});

// fig-simhash: distances in bits
const r = seeded(5);
const groups: Record<string, number[]> = { copy: [], edited: [], unrelated: [] };
for (let i = 0; i < 1000; i += 1) {
  const a = article(i);
  const h = simhash(a);
  groups.copy?.push(distance(h, simhash(a.concat(article(-1 - i, 12)))));
  groups.edited?.push(distance(h, simhash(a.map((w) => (r() < 0.05 ? `x${Math.floor(r() * 1e6)}` : w)))));
  groups.unrelated?.push(distance(h, simhash(article(5000 + i))));
}
const hist = Object.fromEntries(Object.entries(groups).map(([k, xs]) => [k, Array.from({ length: 65 }, (_, d) => xs.filter((x) => x === d).length)]));
console.log(JSON.stringify({ trace, sweep, hist }));
