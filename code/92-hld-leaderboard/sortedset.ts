// A sorted set in the style of Redis: a hash map from member to score, and a skip list ordered by
// (score, member) whose forward pointers also record how many places they jump ("span"). Summing
// spans on the way down gives a member's rank in O(log n) without counting the members before it.
interface SkipNode {
  readonly member: string;
  readonly score: number;
  readonly next: (SkipNode | null)[];
  readonly span: number[];
}
const MAX_LEVEL = 32;
const P = 0.25;

export class SortedSet {
  private readonly head: SkipNode = { member: "", score: -Infinity, next: Array(MAX_LEVEL).fill(null), span: Array(MAX_LEVEL).fill(0) };
  private level = 1;
  private count = 0;
  private readonly scores = new Map<string, number>();
  private readonly random: () => number;
  steps = 0;   // pointers followed by the last operation: the work done

  constructor(random: () => number) {
    this.random = random;
  }
  get size(): number {
    return this.count;
  }
  score(member: string): number | undefined {
    return this.scores.get(member);
  }
  // ZADD: sets a member's score, moving it if it was there before.
  add(member: string, score: number): void {
    const old = this.scores.get(member);
    if (old !== undefined) this.unlink(member, old);
    this.insert(member, score);
    this.scores.set(member, score);
  }
  // ZADD GT: sets the score only if it is higher than the current one (a new member is added).
  // Scores that only grow can then be written as totals, in any order, any number of times.
  addIfGreater(member: string, score: number): boolean {
    const old = this.scores.get(member);
    if (old !== undefined && score <= old) return false;
    this.add(member, score);
    return true;
  }
  // ZINCRBY: adds to a member's score (a new member starts at zero) and returns the new score.
  incrBy(member: string, delta: number): number {
    const score = (this.scores.get(member) ?? 0) + delta;
    this.add(member, score);
    return score;
  }
  remove(member: string): boolean {
    const old = this.scores.get(member);
    if (old === undefined) return false;
    this.unlink(member, old);
    this.scores.delete(member);
    return true;
  }
  // ZREVRANK: 0 for the highest score.
  revRank(member: string): number | undefined {
    const score = this.scores.get(member);
    if (score === undefined) return undefined;
    this.steps = 0;
    let rank = 0;
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i -= 1) {
      for (let n = x.next[i]; n && !before(member, score, n); n = x.next[i]) {
        rank += x.span[i] as number;
        x = n;
        this.steps += 1;
      }
      if (x.member === member && x !== this.head) return this.count - rank;
    }
    return undefined;
  }
  // ZREVRANGE start stop: members from the top, both ends included.
  revRange(start: number, stop: number): { member: string; score: number }[] {
    const last = Math.min(stop, this.count - 1);
    if (start > last) return [];
    // ascending positions count - 1 - last .. count - 1 - start, walked backward
    let x = this.nodeAt(this.count - last);   // 1-based ascending rank
    const items: { member: string; score: number }[] = [];
    for (let k = start; k <= last && x; k += 1) { items.push({ member: x.member, score: x.score }); x = x.next[0] ?? null; }
    return items.reverse();
  }
  // ZCOUNT (score, +inf): how many members have a higher score. Used to rank across shards.
  countAbove(score: number): number {
    this.steps = 0;
    let atOrBelow = 0;
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i -= 1) {
      for (let n = x.next[i]; n && n.score <= score; n = x.next[i]) {
        atOrBelow += x.span[i] as number;
        x = n;
        this.steps += 1;
      }
    }
    return this.count - atOrBelow;
  }
  // The member at a 1-based ascending rank, by following spans.
  private nodeAt(rank: number): SkipNode | null {
    this.steps = 0;
    let traversed = 0;
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i -= 1) {
      for (let n = x.next[i]; n && traversed + (x.span[i] as number) <= rank; n = x.next[i]) {
        traversed += x.span[i] as number;
        x = n;
        this.steps += 1;
      }
      if (traversed === rank) return x;
    }
    return null;
  }
  private randomLevel(): number {
    let level = 1;
    while (this.random() < P && level < MAX_LEVEL) level += 1;
    return level;
  }
  private insert(member: string, score: number): void {
    const update: SkipNode[] = [], rank: number[] = [];
    let x = this.head;
    this.steps = 0;
    for (let i = this.level - 1; i >= 0; i -= 1) {
      rank[i] = i === this.level - 1 ? 0 : (rank[i + 1] as number);
      for (let n = x.next[i]; n && before(n.member, n.score, { member, score }); n = x.next[i]) {
        rank[i] = (rank[i] as number) + (x.span[i] as number);
        x = n;
        this.steps += 1;
      }
      update[i] = x;
    }
    const level = this.randomLevel();
    if (level > this.level) {
      for (let i = this.level; i < level; i += 1) {
        rank[i] = 0;
        update[i] = this.head;
        this.head.span[i] = this.count;
      }
      this.level = level;
    }
    const node: SkipNode = { member, score, next: Array(level).fill(null), span: Array(level).fill(0) };
    for (let i = 0; i < level; i += 1) {
      const u = update[i] as SkipNode;
      node.next[i] = u.next[i] ?? null;
      u.next[i] = node;
      node.span[i] = (u.span[i] as number) - ((rank[0] as number) - (rank[i] as number));
      u.span[i] = (rank[0] as number) - (rank[i] as number) + 1;
    }
    for (let i = level; i < this.level; i += 1) (update[i] as SkipNode).span[i] = ((update[i] as SkipNode).span[i] as number) + 1;
    this.count += 1;
  }
  private unlink(member: string, score: number): void {
    const update: SkipNode[] = [];
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i -= 1) {
      for (let n = x.next[i]; n && before(n.member, n.score, { member, score }); n = x.next[i]) x = n;
      update[i] = x;
    }
    const target = x.next[0];
    if (!target || target.member !== member) throw new Error(`not found: ${member}`);
    for (let i = 0; i < this.level; i += 1) {
      const u = update[i] as SkipNode;
      if (u.next[i] === target) {
        u.span[i] = (u.span[i] as number) + (target.span[i] as number) - 1;
        u.next[i] = target.next[i] ?? null;
      } else {
        u.span[i] = (u.span[i] as number) - 1;
      }
    }
    while (this.level > 1 && this.head.next[this.level - 1] === null) this.level -= 1;
    this.count -= 1;
  }
}

// Order by score, then by member name: the order Redis uses, so equal scores sort by name.
function before(member: string, score: number, other: { member: string; score: number }): boolean {
  return score < other.score || (score === other.score && member < other.member);
}
