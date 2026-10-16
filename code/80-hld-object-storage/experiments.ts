// The simulations and models behind the chapter's numbers. Every random choice is seeded.
import { annualLoss, nines, rackLoss, simulateLosses } from "./durability.ts";
import { compaction } from "./volumes.ts";

export const SCHEMES = [
  { name: "3 copies", k: 1, m: 2 },
  { name: "6 + 3", k: 6, m: 3 },
  { name: "10 + 4", k: 10, m: 4 },
  { name: "17 + 3", k: 17, m: 3 },
];
export const AFR = 0.0136; // Backblaze's fleet, 2025

// A. The model at a real failure rate, for several repair times.
export function durabilityGrid(repairHours = [1, 6, 24, 72, 168]) {
  return SCHEMES.map((s) => ({
    ...s,
    overhead: (s.k + s.m) / s.k,
    byRepair: repairHours.map((h) => {
      const p = annualLoss(s.k, s.m, AFR, h);
      return { repairHours: h, annualLoss: p, nines: nines(p) };
    }),
  }));
}

// B. The model checked against a simulation of disks, at rates high enough for losses to be counted.
export function validation() {
  const cluster = { racks: 12, disksPerRack: 10 };
  return [
    { label: "3 copies", ...simulateLosses(cluster, 5000, 1, 2, 0.5, 24 * 14, 200, 101) },
    { label: "6 + 3", ...simulateLosses(cluster, 5000, 6, 3, 0.5, 24 * 14, 200, 102) },
  ];
}

// C. A rack destroyed: random placement against one piece in each rack.
export function racks() {
  const cluster = { racks: 12, disksPerRack: 10 };
  return SCHEMES.slice(0, 2).map((s) => ({
    name: s.name,
    random: rackLoss(cluster, 100_000, s.k, s.m, false, 111),
    rackAware: rackLoss(cluster, 100_000, s.k, s.m, true, 112),
  }));
}

// D. Compaction thresholds.
export const thresholds = (list = [0.1, 0.25, 0.5, 0.75, 0.9]) => list.map((g) => compaction(g));
