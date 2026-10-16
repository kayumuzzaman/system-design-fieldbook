// Counts that lose half their weight every `halfLife` hours, updated as each search arrives.
// Only the count and the time of its last update are kept for each query.
export class DecayedCounts {
  private readonly halfLife: number;
  private readonly entries = new Map<string, { value: number; at: number }>();
  constructor(halfLifeHours: number) {
    this.halfLife = halfLifeHours;
  }
  add(query: string, at: number, weight = 1): void {
    this.entries.set(query, { value: this.value(query, at) + weight, at });
  }
  value(query: string, now: number): number {
    const e = this.entries.get(query);
    return e ? e.value * 0.5 ** ((now - e.at) / this.halfLife) : 0;
  }
}
