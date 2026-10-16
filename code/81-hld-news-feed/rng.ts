// A seeded random number generator (mulberry32). The same seed gives the same numbers on every run,
// so every result the chapter quotes can be reproduced.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  // A number in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // A whole number in [0, n).
  below(n: number): number {
    return Math.floor(this.next() * n);
  }
  // Waiting time between events that happen `rate` times a second on average.
  exponential(rate: number): number {
    return -Math.log(1 - this.next()) / rate;
  }
  // A standard normal number (Box-Muller).
  normal(): number {
    return Math.sqrt(-2 * Math.log(1 - this.next())) * Math.cos(2 * Math.PI * this.next());
  }
}
