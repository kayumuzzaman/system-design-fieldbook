import { seeded } from "./random.ts";

// A payment travels app → payment service → provider. On either hop the request can be lost
// (the far side never sees it) or the response can be lost (the far side acted, the caller does not
// know). Both look the same to the caller: a timeout. Callers retry. The question is which keys
// stop a retry from becoming a second charge.
export type Keys = "no keys" | "key from the app only" | "one key, end to end";
export const KEYS: Keys[] = ["no keys", "key from the app only", "one key, end to end"];

// The provider: charges a card. With an idempotency key, a repeat returns the saved result.
class Provider {
  readonly chargesPerOrder = new Map<string, number>();
  private readonly saved = new Map<string, string>();
  private n = 0;
  charge(order: string, key: string | undefined): string {
    if (key !== undefined && this.saved.has(key)) return this.saved.get(key) as string;
    this.chargesPerOrder.set(order, (this.chargesPerOrder.get(order) ?? 0) + 1);
    const id = `ch_${++this.n}`;
    if (key !== undefined) this.saved.set(key, id);
    return id;
  }
}

export interface Outcome {
  keys: Keys; faultRate: number; payments: number;
  chargedTwiceOrMore: number;   // orders with more than one charge
  extraCharges: number;         // charges beyond the first
  chargedButToldFailed: number; // the app gave up although the card was charged
}

export function run(keys: Keys, faultRate: number, payments: number, seed: number): Outcome {
  const random = seeded(seed);
  const lost = () => random() < faultRate;
  const provider = new Provider();
  const done = new Map<string, string>();          // the payment service's record of finished payments, by app key
  let toldFailed = 0;
  for (let p = 0; p < payments; p += 1) {
    const order = `o${p}`;
    const appKey = `app-${p}`;                      // made once, when the customer presses pay
    let success = false;
    for (let a = 0; a < 3 && !success; a += 1) {    // the app tries three times
      if (lost()) continue;                         // request to the payment service lost
      // --- inside the payment service
      let result: string | undefined = keys === "no keys" ? undefined : done.get(appKey);
      for (let s = 0; s < 3 && result === undefined; s += 1) {   // the service tries the provider three times
        if (lost()) continue;                       // request to the provider lost
        const providerKey = keys === "one key, end to end" ? appKey : undefined;
        const id = provider.charge(order, providerKey);
        if (lost()) continue;                       // the provider charged, but its answer was lost
        result = id;
      }
      if (result !== undefined && keys !== "no keys") done.set(appKey, result);
      // --- back to the app
      if (result === undefined) continue;           // the service answers 504: outcome unknown
      if (lost()) continue;                         // the answer to the app was lost
      success = true;
    }
    if (!success && (provider.chargesPerOrder.get(order) ?? 0) > 0) toldFailed += 1;
  }
  let twice = 0, extra = 0;
  for (const n of provider.chargesPerOrder.values()) if (n > 1) { twice += 1; extra += n - 1; }
  return { keys, faultRate, payments, chargedTwiceOrMore: twice, extraCharges: extra, chargedButToldFailed: toldFailed };
}
