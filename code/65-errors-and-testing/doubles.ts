export interface PaymentGateway {
  charge(customer: string, cents: number): Promise<{ ok: true; reference: string } | { ok: false; reason: string }>;
}
export interface Mailer {
  send(to: string, subject: string): Promise<void>;
}
export interface AuditLog {
  record(entry: string): void;
}

// The unit under test. It has three collaborators and receives all of them.
export class Checkout {
  private readonly gateway: PaymentGateway;
  private readonly mailer: Mailer;
  private readonly audit: AuditLog;

  constructor(gateway: PaymentGateway, mailer: Mailer, audit: AuditLog) {
    this.gateway = gateway;
    this.mailer = mailer;
    this.audit = audit;
  }

  async pay(customer: string, cents: number): Promise<"paid" | "declined"> {
    const outcome = await this.gateway.charge(customer, cents);
    if (!outcome.ok) return "declined";
    await this.mailer.send(customer, `Receipt ${outcome.reference}`);
    return "paid";
  }
}

// A dummy fills a parameter that this test never exercises.
export const dummyAudit: AuditLog = { record: () => {} };

// A stub returns a canned answer, to steer the unit down one path.
export const stubGateway = (answer: Awaited<ReturnType<PaymentGateway["charge"]>>): PaymentGateway => ({ charge: async () => answer });

// A spy also remembers how it was called, so that the test can ask afterward.
export class SpyMailer implements Mailer {
  readonly sent: { to: string; subject: string }[] = [];
  async send(to: string, subject: string): Promise<void> {
    this.sent.push({ to, subject });
  }
}

// A fake is a working implementation that takes a shortcut: here, balances in a map where the real one calls a bank.
export class FakeGateway implements PaymentGateway {
  private readonly balances: Map<string, number>;
  private count = 0;
  constructor(balances: Record<string, number>) {
    this.balances = new Map(Object.entries(balances));
  }
  async charge(customer: string, cents: number): Promise<{ ok: true; reference: string } | { ok: false; reason: string }> {
    const balance = this.balances.get(customer) ?? 0;
    if (balance < cents) return { ok: false, reason: "insufficient-funds" };
    this.balances.set(customer, balance - cents);
    this.count += 1;
    return { ok: true, reference: `ref-${this.count}` };
  }
  balanceOf(customer: string): number {
    return this.balances.get(customer) ?? 0;
  }
}
