// A trip's life as a state machine. Every change is a named event with an id, so a repeated
// event (a retried request, a duplicated message) changes nothing the second time.
export type TripState = "requested" | "offered" | "accepted" | "arrived" | "in_progress" | "completed" | "canceled";
export type TripEvent =
  | { readonly id: string; readonly type: "offer"; readonly driver: string }
  | { readonly id: string; readonly type: "decline" | "expire" }
  | { readonly id: string; readonly type: "accept" | "arrive" | "start" | "complete" | "cancel" };

const allowed: Record<TripEvent["type"], { from: TripState[]; to: TripState }> = {
  offer: { from: ["requested"], to: "offered" },
  decline: { from: ["offered"], to: "requested" },
  expire: { from: ["offered"], to: "requested" },
  accept: { from: ["offered"], to: "accepted" },
  arrive: { from: ["accepted"], to: "arrived" },
  start: { from: ["arrived"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "completed" },
  cancel: { from: ["requested", "offered", "accepted", "arrived"], to: "canceled" },
};

export class Trip {
  state: TripState = "requested";
  driver: string | null = null;
  private readonly seen = new Set<string>();
  readonly history: TripState[] = ["requested"];

  apply(e: TripEvent): "applied" | "duplicate" | "refused" {
    if (this.seen.has(e.id)) return "duplicate";
    const rule = allowed[e.type];
    if (!rule.from.includes(this.state)) return "refused";
    this.seen.add(e.id);
    this.state = rule.to;
    if (e.type === "offer") this.driver = e.driver;
    if (e.type === "decline" || e.type === "expire") this.driver = null;
    this.history.push(this.state);
    return "applied";
  }
}

// Each driver is either free or held by one trip. Claiming is a compare-and-set, so two
// dispatchers that pick the same driver at the same moment cannot both get them.
export class Drivers {
  private readonly holder = new Map<string, string | null>();
  add(driver: string): void {
    this.holder.set(driver, null);
  }
  claim(driver: string, trip: string): boolean {
    if (this.holder.get(driver) !== null) return false; // unknown, or already held
    this.holder.set(driver, trip);
    return true;
  }
  release(driver: string, trip: string): boolean {
    if (this.holder.get(driver) !== trip) return false; // only the holder may release
    this.holder.set(driver, null);
    return true;
  }
  heldBy(driver: string): string | null | undefined {
    return this.holder.get(driver);
  }
}
