// The hit ratio of an LRU cache of every size, from one pass over the requests.
// An LRU cache of size C hits a request exactly when fewer than C other links were used since the
// last request for the same link (Mattson and others, 1970). So count, for each request, the distinct
// links used since its link was last used. A Fenwick tree over positions in time does the counting:
// each link is marked at the position of its latest use, and the count is a sum over a range.
export function lruHitsBySize(stream: Int32Array, links: number, sizes: readonly number[], warm = 0) {
  const tree = new Int32Array(stream.length + 1);
  const add = (i: number, v: number) => {
    for (i++; i <= stream.length; i += i & -i) tree[i] += v;
  };
  const prefix = (i: number) => {
    let s = 0;
    for (i++; i > 0; i -= i & -i) s += tree[i];
    return s;
  };
  const last = new Int32Array(links).fill(-1);
  const sorted = [...sizes].sort((a, b) => a - b);
  const hitsBelow = new Float64Array(sorted.length); // hitsBelow[j]: requests with distance < sorted[j]
  let firstUses = 0;
  for (let t = 0; t < stream.length; t++) {
    const link = stream[t];
    const before = last[link];
    if (before >= 0) {
      const distance = prefix(t - 1) - prefix(before); // distinct links used strictly between
      if (t >= warm) for (let j = sorted.length - 1; j >= 0 && distance < sorted[j]; j--) hitsBelow[j]++;
      add(before, -1);
    } else if (t >= warm) firstUses++;
    add(t, 1);
    last[link] = t;
  }
  const measured = stream.length - warm;
  return {
    measured,
    firstUses,
    bySize: sizes.map((size) => ({ size, hits: hitsBelow[sorted.indexOf(size)] })),
  };
}
