import { seeded } from "./random.ts";
import { Counter, similarity, unit, type Hit, type Vector } from "./vectors.ts";

// An inverted file index: k-means splits the vectors into clusters, and each cluster keeps a list of its
// members. A search compares the query with the cluster centers, then only with the members of the
// `probes` nearest clusters.
export class IvfIndex {
  readonly centers: Vector[];
  readonly lists: number[][];
  private readonly vectors: readonly Vector[];

  constructor(vectors: readonly Vector[], clusters: number, seed = 1, rounds = 10, build = new Counter()) {
    this.vectors = vectors;
    const random = seeded(seed);
    this.centers = Array.from({ length: clusters }, () => vectors[Math.floor(random() * vectors.length)] as Vector);
    this.lists = [];
    for (let round = 0; round < rounds; round += 1) {
      this.lists.splice(0, this.lists.length, ...this.centers.map(() => [] as number[]));
      vectors.forEach((v, id) => (this.lists[this.nearestCenters(v, 1, build)[0] as number] as number[]).push(id));
      // move each center to the middle of its members
      this.centers.forEach((c, i) => {
        const members = this.lists[i] as number[];
        if (members.length === 0) return;
        const sum = new Float32Array(c.length);
        for (const id of members) (vectors[id] as Vector).forEach((x, d) => (sum[d] = (sum[d] as number) + x));
        this.centers[i] = unit(sum);
      });
    }
    // a last assignment, so that each list holds the members of its final center
    this.lists.splice(0, this.lists.length, ...this.centers.map(() => [] as number[]));
    vectors.forEach((v, id) => (this.lists[this.nearestCenters(v, 1, build)[0] as number] as number[]).push(id));
  }

  search(query: Vector, k: number, probes: number, counter?: Counter): Hit[] {
    const hits: Hit[] = [];
    for (const list of this.nearestCenters(query, probes, counter)) {
      for (const id of this.lists[list] as number[]) hits.push({ id, score: similarity(query, this.vectors[id] as Vector, counter) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  private nearestCenters(query: Vector, n: number, counter?: Counter): number[] {
    if (n === 1) {
      let best = 0, score = -Infinity;
      this.centers.forEach((c, i) => { const s = similarity(query, c, counter); if (s > score) { score = s; best = i; } });
      return [best];
    }
    return this.centers.map((c, i) => ({ i, s: similarity(query, c, counter) }))
      .sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.i);
  }
}
