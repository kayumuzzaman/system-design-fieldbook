import { buildGraph, followerCount } from './graph.ts';
import type { Graph } from './graph.ts';
import type { FanoutConfig } from './fanout.ts';

// The settings every result in the chapter comes from.
export const NETWORK = { users: 100_000, meanFollows: 60, seed: 81 };
export const THRESHOLDS = [Infinity, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 0];

export function network(): Graph {
  return buildGraph(NETWORK.users, NETWORK.meanFollows, NETWORK.seed);
}

export function fanoutConfig(g: Graph): FanoutConfig {
  return {
    workers: 16,
    insertsPerSecond: 5_000,
    postsPerSecond: 500,
    seconds: 120,
    followerCounts: Int32Array.from({ length: g.users }, (_, u) => followerCount(g, u)),
    celebrityAt: 10,
    celebrityFollowers: 2_000_000,
    batch: 1_000,
    seed: 7,
  };
}
