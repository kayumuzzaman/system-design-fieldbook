import type { Graph } from './graph.ts';
import { followerCount } from './graph.ts';
import { MinHeap } from './heap.ts';

// Post ids grow with time, like the time-ordered ids of the unique-ids chapter,
// so "newer" and "larger id" mean the same thing.
export type Post = { readonly id: number; readonly author: number };

// What a strategy did, counted in the units a cache would bill for.
export type Work = { inserts: number; timelinesRead: number; entriesScanned: number };

export interface FeedStrategy {
  readonly name: string;
  readonly work: Work;
  publish(post: Post): void;
  // Up to `limit` post ids for `user`, newest first, all older than `before` (a cursor).
  read(user: number, limit: number, before?: number): number[];
}

// A list of post ids, oldest first, that keeps only the newest `cap`.
class Capped {
  private readonly ids: number[] = [];
  private readonly cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }
  add(id: number): void {
    this.ids.push(id);
    if (this.ids.length > this.cap) this.ids.shift();
  }
  // Index of the newest id older than `before`, or -1.
  start(before: number): number {
    let lo = 0, hi = this.ids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.ids[mid] as number) < before) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }
  at(i: number): number {
    return this.ids[i] as number;
  }
}

// Merges several newest-first lists into one, taking `limit` ids. Each list is a Capped plus a position.
function merge(lists: Capped[], limit: number, before: number, work: Work): number[] {
  type Head = { list: Capped; i: number };
  const heap = new MinHeap<Head>((a, b) => a.list.at(a.i) > b.list.at(b.i));
  for (const list of lists) {
    work.timelinesRead++;
    const i = list.start(before);
    if (i >= 0) heap.push({ list, i });
  }
  const out: number[] = [];
  while (out.length < limit && heap.size > 0) {
    const h = heap.pop() as Head;
    out.push(h.list.at(h.i));
    work.entriesScanned++;
    if (h.i > 0) heap.push({ list: h.list, i: h.i - 1 });
  }
  return out;
}

function newWork(): Work {
  return { inserts: 0, timelinesRead: 0, entriesScanned: 0 };
}

// Every strategy writes a new post once to its author's own timeline, the list a profile page shows.

// Fan-out on write: the post is also copied into the feed of each follower, and of its author.
// Reading is one list.
export class PushFeed implements FeedStrategy {
  readonly name: string = 'fan-out on write';
  readonly work: Work = newWork();
  private readonly graph: Graph;
  private readonly feeds: Capped[];
  private readonly timelines: Capped[];

  constructor(graph: Graph, cap: number) {
    this.graph = graph;
    this.feeds = Array.from({ length: graph.users }, () => new Capped(cap));
    this.timelines = Array.from({ length: graph.users }, () => new Capped(cap));
  }
  publish(post: Post): void {
    const g = this.graph;
    (this.timelines[post.author] as Capped).add(post.id);
    this.work.inserts++;
    this.insert(post.author, post.id);
    for (let k = g.followerStart[post.author] as number; k < (g.followerStart[post.author + 1] as number); k++) {
      this.insert(g.followers[k] as number, post.id);
    }
  }
  private insert(user: number, id: number): void {
    (this.feeds[user] as Capped).add(id);
    this.work.inserts++;
  }
  read(user: number, limit: number, before = Infinity): number[] {
    return merge([this.feeds[user] as Capped], limit, before, this.work);
  }
}

// Fan-out on read: the post is written only to its author's timeline.
// Reading merges the timelines of everyone the reader follows.
export class PullFeed implements FeedStrategy {
  readonly name: string = 'fan-out on read';
  readonly work: Work = newWork();
  private readonly graph: Graph;
  private readonly timelines: Capped[];

  constructor(graph: Graph, cap: number) {
    this.graph = graph;
    this.timelines = Array.from({ length: graph.users }, () => new Capped(cap));
  }
  publish(post: Post): void {
    (this.timelines[post.author] as Capped).add(post.id);
    this.work.inserts++;
  }
  read(user: number, limit: number, before = Infinity): number[] {
    const g = this.graph;
    const lists = [this.timelines[user] as Capped];
    for (let k = g.followeeStart[user] as number; k < (g.followeeStart[user + 1] as number); k++) {
      lists.push(this.timelines[g.followees[k] as number] as Capped);
    }
    return merge(lists, limit, before, this.work);
  }
}

// The hybrid: accounts with at least `threshold` followers are not fanned out.
// Their posts stay on their own timeline, and readers merge in the few such accounts they follow.
export class HybridFeed implements FeedStrategy {
  readonly name: string;
  readonly work: Work = newWork();
  private readonly graph: Graph;
  private readonly threshold: number;
  private readonly feeds: Capped[];
  private readonly timelines: Capped[];

  constructor(graph: Graph, cap: number, threshold: number) {
    this.graph = graph;
    this.threshold = threshold;
    this.name = `hybrid, threshold ${threshold}`;
    this.feeds = Array.from({ length: graph.users }, () => new Capped(cap));
    this.timelines = Array.from({ length: graph.users }, () => new Capped(cap));
  }
  isCelebrity(user: number): boolean {
    return followerCount(this.graph, user) >= this.threshold;
  }
  publish(post: Post): void {
    const g = this.graph, a = post.author;
    (this.timelines[a] as Capped).add(post.id);
    this.work.inserts++;
    if (this.isCelebrity(a)) return;                       // read-time merge instead
    this.insert(a, post.id);
    for (let k = g.followerStart[a] as number; k < (g.followerStart[a + 1] as number); k++) {
      this.insert(g.followers[k] as number, post.id);
    }
  }
  private insert(user: number, id: number): void {
    (this.feeds[user] as Capped).add(id);
    this.work.inserts++;
  }
  read(user: number, limit: number, before = Infinity): number[] {
    const g = this.graph;
    const lists = [this.feeds[user] as Capped];
    if (this.isCelebrity(user)) lists.push(this.timelines[user] as Capped);
    for (let k = g.followeeStart[user] as number; k < (g.followeeStart[user + 1] as number); k++) {
      const v = g.followees[k] as number;
      if (this.isCelebrity(v)) lists.push(this.timelines[v] as Capped);
    }
    return merge(lists, limit, before, this.work);
  }
}
