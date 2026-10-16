// Before: every question about plans is a function that lists the plans. Prices are in cents.
export type PlanName = "free" | "plus" | "family";

export function monthlyPriceBefore(plan: PlanName, gigabytes: number): number {
  if (plan === "free") return 0;
  if (plan === "plus") return 300 + Math.max(0, gigabytes - 100) * 2;
  return 800 + Math.max(0, gigabytes - 500) * 2;
}

export function albumLimitBefore(plan: PlanName): number {
  if (plan === "free") return 10;
  if (plan === "plus") return 200;
  return 1000;
}

// After: a plan is an object that answers the questions about itself.
export interface Plan {
  readonly name: string;
  readonly albumLimit: number;
  monthlyPrice(gigabytes: number): number;
}

const withAllowance = (name: string, base: number, included: number, albumLimit: number): Plan => ({
  name,
  albumLimit,
  monthlyPrice: (gigabytes) => base + Math.max(0, gigabytes - included) * 2,
});

export const free: Plan = { name: "free", albumLimit: 10, monthlyPrice: () => 0 };
export const plus = withAllowance("plus", 300, 100, 200);
export const family = withAllowance("family", 800, 500, 1000);

export class Plans {
  private readonly byName = new Map<string, Plan>();

  constructor(plans: Plan[]) {
    for (const plan of plans) this.byName.set(plan.name, plan);
  }
  named(name: string): Plan {
    const plan = this.byName.get(name);
    if (!plan) throw new Error(`no plan called ${name}`);
    return plan;
  }
}

// A year later: a new plan with a rule of its own. Nothing above this line is edited.
export const pro: Plan = {
  name: "pro",
  albumLimit: 5000,
  monthlyPrice: (gigabytes) => 2000 + Math.ceil(Math.max(0, gigabytes - 2000) / 1000) * 500, // sold in blocks of a terabyte
};
