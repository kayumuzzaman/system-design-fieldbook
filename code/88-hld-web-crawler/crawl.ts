import { MinHeap } from "./heap.ts";
import { FifoFrontier, HostQueueFrontier, type Frontier } from "./frontier.ts";
import { BloomFilter } from "./bloom.ts";
import { hostOf, normalize } from "./url.ts";
import { hash32, seeded, type SyntheticWeb } from "./web.ts";

export type CrawlOptions = {
  readonly frontier: "fifo" | "fifo-impolite" | "host-queues";
  readonly fetchers: number;
  readonly delay: number; // seconds between the end of one request to a host and the start of the next
  readonly maxPages: number;
  readonly seen: "set" | "bloom";
  readonly normalize: boolean;
  readonly hostBudget: number | null; // most URLs accepted from one host
  readonly bloomItems?: number; // what the Bloom filter is sized for
  readonly seed: number;
};

// A crawl in simulated time: fetchers take URLs from the frontier, each fetch takes a random
// time, and the links of each page are filtered and added when its fetch completes.
export function crawl(web: SyntheticWeb, seeds: string[], o: CrawlOptions) {
  const random = seeded(o.seed);
  const frontier: Frontier = o.frontier === "host-queues" ? new HostQueueFrontier(o.delay) : new FifoFrontier(o.frontier === "fifo", o.delay);
  const exact = new Set<string>();
  const bloom = o.seen === "bloom" ? new BloomFilter(o.bloomItems ?? o.maxPages * 3, 0.01) : null;
  const perHost = new Map<string, number>();
  const lastEnd = new Map<string, number>();
  const contentSeen = new Set<number>();
  const fetchedCanonical = new Set<string>();
  const byHost = new Map<string, number>();
  const events = new MinHeap<{ at: number; url: string; host: string }>((a, b) => a.at < b.at); // host "" is a wake-up
  let wakeAt = Infinity;
  let idle = o.fetchers;
  let dispatched = 0, fetched = 0, impolite = 0, duplicateFetches = 0, duplicateContent = 0, bloomSkipped = 0, now = 0;

  const accept = (raw: string) => {
    const url = o.normalize ? normalize(raw) : raw;
    if (!url) return;
    const isNew = !exact.has(url);
    if (bloom) {
      if (bloom.mightContain(url)) { if (isNew) { bloomSkipped += 1; exact.add(url); } return; }
      bloom.add(url);
    } else if (!isNew) return;
    exact.add(url);
    let host: string;
    try { host = hostOf(url).toLowerCase(); } catch { return; }
    const n = perHost.get(host) ?? 0;
    if (o.hostBudget !== null && n >= o.hostBudget) return;
    perHost.set(host, n + 1);
    frontier.add(url, host);
  };
  const dispatch = () => {
    while (idle > 0 && dispatched < o.maxPages) {
      const at = frontier.earliest();
      if (at === null) return;
      if (at > now) { // nothing may start yet: come back then, rather than tie up a fetcher waiting
        if (at < wakeAt) { wakeAt = at; events.push({ at, url: "", host: "" }); }
        return;
      }
      const next = frontier.next(now);
      if (!next) return;
      idle -= 1;
      dispatched += 1;
      const end = next.start + 0.1 + -Math.log(1 - random()) * 0.4; // 0.5 s on average
      if (next.start < (lastEnd.get(next.host) ?? -Infinity) + o.delay) impolite += 1;
      lastEnd.set(next.host, end);
      frontier.fetched(next.host, end);
      events.push({ at: end, url: next.url, host: next.host });
    }
  };
  for (const s of seeds) accept(s);
  dispatch();
  while (events.size > 0) {
    const ev = events.pop() as { at: number; url: string; host: string };
    now = ev.at;
    if (ev.host === "") {
      if (ev.at === wakeAt) wakeAt = Infinity;
      dispatch();
      continue;
    }
    idle += 1;
    fetched += 1;
    byHost.set(ev.host, (byHost.get(ev.host) ?? 0) + 1);
    const canonical = normalize(ev.url) ?? ev.url;
    if (fetchedCanonical.has(canonical)) duplicateFetches += 1;
    fetchedCanonical.add(canonical);
    const page = web.fetch(ev.url);
    const h = hash32(page.text);
    if (page.status === 200 && contentSeen.has(h)) duplicateContent += 1;
    contentSeen.add(h);
    for (const link of page.links) accept(link);
    dispatch();
  }
  return {
    fetched, seconds: now, pagesPerSecond: fetched / now, impolite, duplicateFetches, duplicateContent, bloomSkipped,
    queued: frontier.size(), hosts: byHost.size, trap: byHost.get("calendar.example") ?? 0,
    bloomBytes: bloom ? bloom.bytes() : 0,
  };
}
