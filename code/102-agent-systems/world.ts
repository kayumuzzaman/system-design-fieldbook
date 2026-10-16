import type { Call } from "./tools.ts";

export interface Charge { id: string; cents: number; date: string; description: string }
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string; transient?: boolean };

// The services the tools reach. Payments remembers idempotency keys: a refund repeated with the same key
// returns the first result instead of paying again (the idempotency chapter's rule).
export class World {
  readonly user: string;
  readonly charges: Charge[];
  readonly refunds: { chargeId: string; cents: number }[] = [];
  readonly emails: { to: string; body: string }[] = [];
  private readonly keys = new Map<string, ToolResult>();
  private readonly help: string;
  flaky = 0; // how many of the next calls fail with a temporary error
  constructor(user: string, charges: Charge[], help: string) {
    this.user = user;
    this.charges = charges;
    this.help = help;
  }

  run(call: Call, idempotencyKey?: string): ToolResult {
    if (this.flaky > 0) { this.flaky -= 1; return { ok: false, error: "service unavailable", transient: true }; }
    if (idempotencyKey && this.keys.has(idempotencyKey)) return this.keys.get(idempotencyKey) as ToolResult;
    const result = this.execute(call);
    if (idempotencyKey) this.keys.set(idempotencyKey, result);
    return result;
  }
  private execute(call: Call): ToolResult {
    const a = call.args;
    switch (call.name) {
      case "find_charges": return { ok: true, data: this.charges };
      case "refund": {
        const charge = this.charges.find((c) => c.id === a.charge_id);
        if (!charge) return { ok: false, error: `no charge ${String(a.charge_id)}` };
        const already = this.refunds.filter((r) => r.chargeId === charge.id).reduce((s, r) => s + r.cents, 0);
        if (already + (a.amount_cents as number) > charge.cents) return { ok: false, error: "refund exceeds the charge" };
        this.refunds.push({ chargeId: charge.id, cents: a.amount_cents as number });
        return { ok: true, data: { refunded: a.amount_cents, charge: charge.id } };
      }
      case "search_help": return { ok: true, data: [{ n: 1, text: this.help }] };
      case "send_email": this.emails.push({ to: String(a.to), body: String(a.body) }); return { ok: true, data: "sent" };
      default: return { ok: false, error: `no tool ${call.name}` };
    }
  }
}
