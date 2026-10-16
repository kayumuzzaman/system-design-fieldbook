// A synthetic web, generated on demand from each URL, so it can be as large as a crawl wants.
// Hosts differ in size; most links stay on their own host; some links are written in odd but
// equivalent forms; a few hosts mirror others; one host is an endless calendar.

export function hash32(text: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const vocabulary = Array.from({ length: 5000 }, (_, i) => `w${i.toString(36)}`);
// An article: 300 words chosen from the vocabulary by the article's own seed.
export function article(id: number, words = 300): string[] {
  const r = seeded(id * 7919 + 1);
  return Array.from({ length: words }, () => vocabulary[Math.floor(r() ** 2 * vocabulary.length)] as string);
}

export type Fetched = { readonly status: 200 | 404; readonly links: string[]; readonly text: string };

export class SyntheticWeb {
  readonly hosts: number;
  private readonly sizes: number[];
  private readonly pickHost: (r: () => number) => number;
  constructor(hosts: number) {
    this.hosts = hosts;
    this.sizes = Array.from({ length: hosts }, (_, i) => Math.max(3, Math.round(4000 / (i + 1) ** 0.9)));
    const cum: number[] = [];
    let total = 0;
    for (let i = 0; i < hosts; i += 1) cum.push((total += 1 / (i + 1)));
    this.pickHost = (r) => { // depends only on the page's own random numbers, so every fetch of a page agrees
      const x = r() * total;
      let lo = 0, hi = hosts - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if ((cum[m] as number) < x) lo = m + 1; else hi = m; }
      return lo;
    };
  }
  static host(i: number): string {
    return `h${i}.example`;
  }
  seeds(n: number): string[] {
    return Array.from({ length: n }, (_, i) => `https://${SyntheticWeb.host(i)}/`);
  }

  fetch(url: string): Fetched {
    let u: URL;
    try { u = new URL(url); } catch { return { status: 404, links: [], text: "" }; }
    const host = u.hostname; // a server sees the host in any case, and never the fragment
    const path = u.pathname;
    const r = seeded(hash32(host + path));
    if (host === "calendar.example") {
      // every day links to the next and the previous one, forever
      const day = Number(/\/day\/(-?\d+)/.exec(path)?.[1] ?? 0);
      return { status: 200, links: [`https://calendar.example/day/${day + 1}`, `https://calendar.example/day/${day - 1}`], text: article(1e6 + day, 40).join(" ") };
    }
    const mirror = /^mirror(\d+)\.example$/.exec(host);
    const hi = mirror ? Number(mirror[1]) : Number(/^h(\d+)\.example$/.exec(host)?.[1] ?? -1);
    if (hi < 0 || hi >= this.hosts) return { status: 404, links: [], text: "" };
    const size = this.sizes[hi] as number;
    const pm = /^\/(?:p\/(\d+))?(\/print)?$/.exec(path);
    if (!pm) return { status: 404, links: [], text: "" };
    const page = Number(pm[1] ?? 0);
    if (page >= size) return { status: 404, links: [], text: "" };
    const words = article(hi * 100_000 + page);
    if (pm[2]) {
      // a printer-friendly copy: the same article, a different footer
      return { status: 200, links: [], text: words.concat(article(-1 - page, 12)).join(" ") };
    }
    const links: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const local = r() < 0.8;
      const h = local ? hi : this.pickHost(r);
      const p = Math.floor(r() * (this.sizes[h] as number));
      let link = `https://${SyntheticWeb.host(h)}/p/${p}`;
      const odd = r();
      if (odd < 0.05) link = `HTTPS://H${h}.EXAMPLE:443/p/${p}`; // same page, different spelling
      else if (odd < 0.1) link += `#section-${Math.floor(r() * 5)}`;
      else if (odd < 0.15) link += `?utm_source=feed${Math.floor(r() * 50)}`;
      links.push(link);
    }
    if (r() < 0.1) links.push(`https://${host}/p/${page}/print`);
    if (r() < 0.01) links.push(`https://mirror${hi}.example/p/${page}`); // an exact copy on another host
    if (hi === 3 && page === 0) links.push("https://calendar.example/day/0");
    return { status: 200, links, text: words.join(" ") };
  }
}
