// How likely a stripe of k data pieces and m parity pieces is to be lost, by a model and by simulation.
// Three full copies are the case k = 1, m = 2: one piece of data, two more that can each rebuild it.
import { Rng } from "./rng.ts";

const HOURS_A_YEAR = 8760;

// The model: each of the k + m pieces fails independently at a constant rate, and each failed piece is
// rebuilt independently at a constant rate. The stripe is lost when more than m pieces are failed at once.
// This is a chain of states 0, 1, ... m + 1 (failed pieces); the expected time to reach m + 1 from 0 is the
// sum over j of the time to go from j to j + 1, which follows tau_j = (1 + repairs_j * tau_(j-1)) / failures_j.
export function meanHoursToLoss(k: number, m: number, annualFailureRate: number, repairHours: number): number {
  const n = k + m;
  const fail = -Math.log(1 - annualFailureRate) / HOURS_A_YEAR; // per piece, per hour
  const repair = 1 / repairHours;
  let tau = 0, total = 0;
  for (let j = 0; j <= m; j++) {
    tau = (1 + j * repair * tau) / ((n - j) * fail);
    total += tau;
  }
  return total;
}

// The chance of losing a given stripe within one year, and the same as a number of nines.
export function annualLoss(k: number, m: number, annualFailureRate: number, repairHours: number): number {
  return -Math.expm1(-HOURS_A_YEAR / meanHoursToLoss(k, m, annualFailureRate, repairHours));
}
export const nines = (p: number): number => -Math.log10(p);

export interface Cluster {
  readonly racks: number;
  readonly disksPerRack: number;
}

// Places each stripe's k + m pieces on distinct disks: at random, or at most one piece in each rack
// (at most ceil((k + m) / racks) if there are more pieces than racks).
export function place(c: Cluster, stripes: number, pieces: number, rackAware: boolean, rng: Rng): Int32Array {
  const disks = c.racks * c.disksPerRack;
  const out = new Int32Array(stripes * pieces);
  const perRack = Math.ceil(pieces / c.racks);
  for (let s = 0; s < stripes; s++) {
    const used = new Set<number>(), inRack = new Map<number, number>();
    for (let p = 0; p < pieces; p++) {
      let d: number;
      do d = rng.below(disks);
      while (used.has(d) || (rackAware && (inRack.get(Math.floor(d / c.disksPerRack)) ?? 0) >= perRack));
      used.add(d);
      const rack = Math.floor(d / c.disksPerRack);
      inRack.set(rack, (inRack.get(rack) ?? 0) + 1);
      out[s * pieces + p] = d;
    }
  }
  return out;
}

// A whole rack is destroyed at once. The share of stripes that lose more than m pieces with it.
export function rackLoss(c: Cluster, stripes: number, k: number, m: number, rackAware: boolean, seed: number): number {
  const pieces = k + m;
  const placed = place(c, stripes, pieces, rackAware, new Rng(seed));
  let lost = 0;
  for (let rack = 0; rack < c.racks; rack++) {
    for (let s = 0; s < stripes; s++) {
      let inRack = 0;
      for (let p = 0; p < pieces; p++) if (Math.floor(placed[s * pieces + p]! / c.disksPerRack) === rack) inRack++;
      if (inRack > m) lost++;
    }
  }
  return lost / (stripes * c.racks); // averaged over which rack is destroyed
}

// The simulation: disks fail at random; a failed disk is replaced and refilled after a fixed repair time.
// A stripe is lost when more than m of its disks are down at once. Run at failure rates far above real
// ones, where losses are common enough to count, and compared with the model at the same rates.
export function simulateLosses(c: Cluster, stripes: number, k: number, m: number, annualFailureRate: number, repairHours: number, years: number, seed: number) {
  const rng = new Rng(seed);
  const pieces = k + m;
  const disks = c.racks * c.disksPerRack;
  const placed = place(c, stripes, pieces, true, rng);
  const onDisk: number[][] = Array.from({ length: disks }, () => []);
  for (let i = 0; i < placed.length; i++) onDisk[placed[i]!]!.push(Math.floor(i / pieces));
  const fail = -Math.log(1 - annualFailureRate) / HOURS_A_YEAR;
  const downUntil = new Float64Array(disks).fill(-1);
  const nextFailure = Float64Array.from({ length: disks }, () => -Math.log(1 - rng.float()) / fail);
  const end = years * HOURS_A_YEAR;
  let losses = 0, failures = 0;
  for (;;) {
    let d = 0;
    for (let i = 1; i < disks; i++) if (nextFailure[i]! < nextFailure[d]!) d = i;
    const t = nextFailure[d]!;
    if (t >= end) break;
    failures++;
    downUntil[d] = t + repairHours;
    for (const s of onDisk[d]!) {
      let down = 0;
      for (let p = 0; p < pieces; p++) if (downUntil[placed[s * pieces + p]!]! > t) down++;
      if (down === m + 1) losses++; // this failure is the one that loses the stripe
    }
    nextFailure[d] = t + repairHours - Math.log(1 - rng.float()) / fail; // the replacement disk can fail too
  }
  return { failures, losses, perStripeYear: losses / (stripes * years), model: HOURS_A_YEAR / meanHoursToLoss(k, m, annualFailureRate, repairHours) };
}
