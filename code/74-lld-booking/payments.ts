// The port through which the booking service takes money. A real adapter would call a payment provider.
export interface ChargeRequest {
  readonly key: string; // the idempotency key: the same key means the same charge
  readonly amount: number; // cents
  readonly customer: string;
}
export type ChargeResult = { readonly ok: true; readonly chargeId: string } | { readonly ok: false; readonly reason: string };

export interface PaymentPort {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(chargeId: string): Promise<void>;
}

export type Answer = "approve" | "decline" | "wait";

interface Charge {
  readonly id: string;
  readonly request: ChargeRequest;
  readonly result: Promise<ChargeResult>;
  status: "pending" | "captured" | "declined" | "refunded";
}

// A fake provider for tests and the simulation. Like a real one, it treats a repeated key as the same charge.
// "wait" leaves a charge pending until settle() is called, so a test decides when the money arrives.
export class FakePayments implements PaymentPort {
  private readonly byKey = new Map<string, Charge>();
  private readonly waiting = new Map<string, (approve: boolean) => void>();
  private readonly answer: (request: ChargeRequest) => Answer;
  private next = 1;
  calls = 0;

  constructor(answer: (request: ChargeRequest) => Answer = () => "approve") {
    this.answer = answer;
  }

  charge(request: ChargeRequest): Promise<ChargeResult> {
    this.calls += 1;
    const seen = this.byKey.get(request.key);
    if (seen) return seen.result;
    const id = `ch_${this.next++}`;
    let finish: (approve: boolean) => void = () => {};
    const result = new Promise<ChargeResult>((resolve) => {
      finish = (approve) => {
        charge.status = approve ? "captured" : "declined";
        resolve(approve ? { ok: true, chargeId: id } : { ok: false, reason: "card declined" });
      };
    });
    const charge: Charge = { id, request, result, status: "pending" };
    this.byKey.set(request.key, charge);
    const answer = this.answer(request);
    if (answer === "wait") this.waiting.set(request.key, finish);
    else finish(answer === "approve");
    return result;
  }

  settle(key: string, approve: boolean): void {
    const finish = this.waiting.get(key);
    if (!finish) throw new Error(`no pending charge for key ${key}`);
    this.waiting.delete(key);
    finish(approve);
  }

  isPending(key: string): boolean {
    return this.waiting.has(key);
  }

  async refund(chargeId: string): Promise<void> {
    const charge = [...this.byKey.values()].find((c) => c.id === chargeId);
    if (!charge || charge.status !== "captured") throw new Error(`cannot refund ${chargeId}`);
    charge.status = "refunded";
  }

  // Money taken counts every captured charge, including those refunded later.
  totals(): { charges: number; taken: number; refunded: number } {
    let charges = 0, taken = 0, refunded = 0;
    for (const c of this.byKey.values()) {
      if (c.status === "captured" || c.status === "refunded") { charges += 1; taken += c.request.amount; }
      if (c.status === "refunded") refunded += c.request.amount;
    }
    return { charges, taken, refunded };
  }
}
