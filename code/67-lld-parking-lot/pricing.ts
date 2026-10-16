export type VehicleKind = "motorcycle" | "car" | "van";

// The pricing strategy: from what was parked and for how many minutes, to a fee in cents.
export type Pricing = (kind: VehicleKind, minutes: number) => number;

// Every started hour is charged in full.
export const hourly = (centsPerHour: Record<VehicleKind, number>): Pricing => (kind, minutes) =>
  Math.ceil(minutes / 60) * centsPerHour[kind];

// A short stay costs nothing. Past the grace period the whole stay is charged.
export const withGrace = (freeMinutes: number, inner: Pricing): Pricing => (kind, minutes) =>
  minutes <= freeMinutes ? 0 : inner(kind, minutes);

// No single day costs more than the cap. Each full day costs exactly the cap.
export const withDailyCap = (capCents: Record<VehicleKind, number>, inner: Pricing): Pricing => (kind, minutes) => {
  const days = Math.floor(minutes / 1440);
  const rest = minutes - days * 1440;
  return days * capCents[kind] + Math.min(capCents[kind], inner(kind, rest));
};

// The policy used in this chapter, assembled from the three parts.
export const standardPricing: Pricing = withGrace(
  15,
  withDailyCap({ motorcycle: 800, car: 2400, van: 4000 }, hourly({ motorcycle: 100, car: 300, van: 500 })),
);
