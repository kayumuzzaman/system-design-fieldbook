// A consistent hashing ring with virtual nodes, and the replicas of each key: the first N distinct
// nodes found clockwise from the key's position. The calculator on the page uses the same hash,
// so that its numbers for a given ring are the ones this file computes.

// FNV-1a over the characters, then the MurmurHash3 finalizer to spread the bits: a 32-bit position.
export function position(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const FULL = 2 ** 32;

export interface Token {
  readonly at: number;
  readonly node: number;
}

export class Ring {
  readonly nodes: number;
  readonly vnodes: number;
  readonly tokens: readonly Token[]; // sorted by position

  constructor(nodes: number, vnodes: number, names: (node: number) => string = (n) => `node-${n}`) {
    this.nodes = nodes;
    this.vnodes = vnodes;
    const tokens: Token[] = [];
    for (let n = 0; n < nodes; n++) for (let v = 0; v < vnodes; v++) tokens.push({ at: position(`${names(n)}#${v}`), node: n });
    tokens.sort((a, b) => a.at - b.at);
    this.tokens = tokens;
  }

  // The index of the first token at or after a position, going clockwise.
  private first(at: number): number {
    let lo = 0, hi = this.tokens.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.tokens[mid]!.at < at) lo = mid + 1;
      else hi = mid;
    }
    return lo % this.tokens.length;
  }

  // The preference list of a key: the first `n` distinct nodes clockwise from its position.
  replicas(key: string, n: number): number[] {
    return this.walk(this.first(position(key)), n);
  }

  private walk(start: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.tokens.length && out.length < n; i++) {
      const node = this.tokens[(start + i) % this.tokens.length]!.node;
      if (!out.includes(node)) out.push(node);
    }
    return out;
  }

  // The share of all data each node stores, with every key kept on `n` nodes. Exact: it adds up the
  // arcs of the ring, each arc being the keys between one token and the one before it.
  shares(n: number): number[] {
    const share = new Array<number>(this.nodes).fill(0);
    const t = this.tokens;
    for (let i = 0; i < t.length; i++) {
      const arc = (t[i]!.at - (i === 0 ? t[t.length - 1]!.at - FULL : t[i - 1]!.at)) / FULL;
      for (const node of this.walk(i, n)) share[node]! += arc / n;
    }
    return share;
  }

  // The nodes holding copies of what `node` holds: where a replacement would copy its data from.
  sourcesFor(node: number, n: number): number[] {
    const sources = new Set<number>();
    const t = this.tokens;
    for (let i = 0; i < t.length; i++) {
      const owners = this.walk(i, n);
      if (owners.includes(node)) for (const o of owners) if (o !== node) sources.add(o);
    }
    return [...sources];
  }
  // The share of all pairs of nodes that hold a copy of some key together. If both fail at once, those
  // keys are left with one copy of n, and a quorum of two cannot be reached for them.
  sharedPairs(n: number): number {
    const pairs = new Set<number>();
    for (let i = 0; i < this.tokens.length; i++) {
      const owners = this.walk(i, n);
      for (let a = 0; a < owners.length; a++)
        for (let b = a + 1; b < owners.length; b++) pairs.add(Math.min(owners[a]!, owners[b]!) * this.nodes + Math.max(owners[a]!, owners[b]!));
    }
    return pairs.size / ((this.nodes * (this.nodes - 1)) / 2);
  }
}

// The largest share over the average share: 1 is perfectly even.
export function imbalance(shares: readonly number[]): number {
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return Math.max(...shares) / mean;
}
