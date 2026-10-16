// One page can be linked under many spellings. Reduce each URL to one canonical form before
// asking whether it has been seen: lower-case scheme and host, no default port, no fragment,
// no tracking parameters, the remaining parameters sorted.
const tracking = /^(utm_[a-z]+|fbclid|gclid|sid|sessionid)$/i;

export function normalize(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.hash = ""; // the server never sees the fragment
  const params = [...u.searchParams].filter(([k]) => !tracking.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = new URLSearchParams(params).toString();
  return u.toString(); // URL already lower-cases the scheme and host and drops a default port
}

export function hostOf(url: string): string {
  return new URL(url).host;
}
