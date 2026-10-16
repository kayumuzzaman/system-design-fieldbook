import type { Graph } from './graph.ts';
import { followeeCount, followerCount } from './graph.ts';
import { quantile } from './fanout.ts';

// The cost of each strategy, counted exactly as the classes in feed.ts count it,
// but worked out from the graph instead of by running every post and every read.
export type ThresholdRow = {
  readonly threshold: number;          // Infinity: fan-out on write for everyone; 0: fan-out on read
  readonly celebrities: number;        // accounts at or above the threshold
  readonly followsToCelebrities: number; // share of all follows that point at them
  readonly insertsPerPost: number;     // average over authors, each posting equally often
  readonly maxInsertsPerPost: number;  // the largest single fan-out
  readonly timelinesPerRead: number;   // average over readers
  readonly timelinesPerReadP99: number;
};

export function thresholdRow(g: Graph, threshold: number): ThresholdRow {
  const push = threshold === Infinity, pull = threshold === 0;
  const celeb = (u: number) => !push && followerCount(g, u) >= threshold;
  let inserts = 0, maxInserts = 0, celebrities = 0, celebFollows = 0;
  for (let a = 0; a < g.users; a++) {
    const f = followerCount(g, a);
    // As in feed.ts: one insert into the author's own timeline, then, unless the author is exempt,
    // one into the author's own feed and one into each follower's feed.
    const n = 1 + (celeb(a) ? 0 : 1 + f);
    inserts += n;
    maxInserts = Math.max(maxInserts, n);
    if (celeb(a)) { celebrities++; celebFollows += f; }
  }
  const perRead = new Float64Array(g.users);
  let reads = 0;
  for (let u = 0; u < g.users; u++) {
    // PullFeed reads the reader's own timeline and every followee's. HybridFeed reads the reader's feed,
    // plus the timelines of exempt accounts: the reader's own, if exempt, and those the reader follows.
    let n = pull ? 1 : 1 + (celeb(u) ? 1 : 0);
    for (let k = g.followeeStart[u] as number; k < (g.followeeStart[u + 1] as number); k++) {
      if (celeb(g.followees[k] as number)) n++;
    }
    perRead[u] = n;
    reads += n;
  }
  return {
    threshold,
    celebrities,
    followsToCelebrities: celebFollows / g.followees.length,
    insertsPerPost: inserts / g.users,
    maxInsertsPerPost: maxInserts,
    timelinesPerRead: reads / g.users,
    timelinesPerReadP99: quantile(perRead, 0.99),
  };
}

export type GraphStats = {
  readonly users: number;
  readonly follows: number;
  readonly meanFollowers: number;
  readonly medianFollowers: number;
  readonly maxFollowers: number;
  readonly top100Share: number;      // share of all follows that point at the 100 most followed
  readonly medianFollows: number;
  readonly maxFollows: number;
};

export function graphStats(g: Graph): GraphStats {
  const fol = Int32Array.from({ length: g.users }, (_, u) => followerCount(g, u)).sort();
  const fee = Int32Array.from({ length: g.users }, (_, u) => followeeCount(g, u)).sort();
  let top = 0;
  for (let i = g.users - 100; i < g.users; i++) top += fol[i] as number;
  return {
    users: g.users,
    follows: g.followees.length,
    meanFollowers: g.followees.length / g.users,
    medianFollowers: fol[g.users >> 1] as number,
    maxFollowers: fol[g.users - 1] as number,
    top100Share: top / g.followees.length,
    medianFollows: fee[g.users >> 1] as number,
    maxFollows: fee[g.users - 1] as number,
  };
}
