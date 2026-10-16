import { SortedSet } from "./sortedset.ts";

// Two ways to split one board over several sorted sets, each counting the calls it makes.

// By hash of the player: even load, but a player's rank needs every shard's count of higher scores.
export class HashShards {
  readonly shards: SortedSet[];
  calls = 0;
  constructor(n: number, random: () => number) {
    this.shards = Array.from({ length: n }, () => new SortedSet(random));
  }
  private shardOf(member: string): SortedSet {
    let h = 2166136261;                          // FNV-1a
    for (let i = 0; i < member.length; i += 1) h = Math.imul(h ^ member.charCodeAt(i), 16777619);
    return this.shards[(h >>> 0) % this.shards.length] as SortedSet;
  }
  add(member: string, score: number): void {
    this.calls += 1;
    this.shardOf(member).add(member, score);
  }
  // Top k: ask every shard for its own top k, merge, keep k (scatter-gather).
  top(k: number): { member: string; score: number }[] {
    this.calls += this.shards.length;
    return this.shards.flatMap((s) => s.revRange(0, k - 1)).sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : -1)).slice(0, k);
  }
  // Rank: the player's own score from its shard, then how many score higher in every shard.
  revRank(member: string): number | undefined {
    this.calls += 1;
    const score = this.shardOf(member).score(member);
    if (score === undefined) return undefined;
    this.calls += this.shards.length;
    return this.shards.reduce((sum, s) => sum + s.countAbove(score), 0);
  }
}

// By score range: shard i holds scores from bounds[i] up to bounds[i + 1]. Rank is local rank plus
// the sizes of the shards above, but players move between shards as they score, and the ranges
// must be chosen to match a distribution that changes over the month.
export class RangeShards {
  readonly shards: SortedSet[];
  private readonly bounds: number[];
  calls = 0;
  moves = 0;
  constructor(bounds: number[], random: () => number) {
    this.bounds = bounds;
    this.shards = bounds.map(() => new SortedSet(random));
  }
  private indexOf(score: number): number {
    let i = 0;
    while (i + 1 < this.bounds.length && score >= (this.bounds[i + 1] as number)) i += 1;
    return i;
  }
  add(member: string, score: number, previous?: number): void {
    const to = this.indexOf(score);
    if (previous !== undefined) {
      const from = this.indexOf(previous);
      if (from !== to) { (this.shards[from] as SortedSet).remove(member); this.calls += 1; this.moves += 1; }
    }
    (this.shards[to] as SortedSet).add(member, score);
    this.calls += 1;
  }
  revRank(member: string, score: number): number {
    const i = this.indexOf(score);
    let above = 0;
    for (let j = i + 1; j < this.shards.length; j += 1) above += (this.shards[j] as SortedSet).size;
    this.calls += 1 + (this.shards.length - i - 1);
    return above + ((this.shards[i] as SortedSet).revRank(member) as number);
  }
  sizes(): number[] {
    return this.shards.map((s) => s.size);
  }
}
