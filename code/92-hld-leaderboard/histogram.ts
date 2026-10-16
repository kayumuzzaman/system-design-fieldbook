// For the long tail: "top 23%" instead of "rank 11,503,227". A histogram of points in buckets that
// grow by a fixed ratio, kept up to date with each score change, answers a percentile in constant time.
export class PointsHistogram {
  private readonly counts: number[];
  private readonly ratio: number;
  private total = 0;
  constructor(buckets = 200, ratio = 1.06) {
    this.counts = Array(buckets).fill(0);
    this.ratio = ratio;
  }
  private bucket(points: number): number {
    return Math.min(this.counts.length - 1, points < 1 ? 0 : 1 + Math.floor(Math.log(points) / Math.log(this.ratio)));
  }
  add(points: number, previous?: number): void {
    if (previous !== undefined) this.counts[this.bucket(previous)] = (this.counts[this.bucket(previous)] as number) - 1;
    else this.total += 1;
    this.counts[this.bucket(points)] = (this.counts[this.bucket(points)] as number) + 1;
  }
  // Estimated share of players with more points: everyone in higher buckets, half of one's own.
  shareAbove(points: number): number {
    const b = this.bucket(points);
    let above = 0;
    for (let i = b + 1; i < this.counts.length; i += 1) above += this.counts[i] as number;
    return (above + ((this.counts[b] as number) - 1) / 2) / this.total;
  }
}
