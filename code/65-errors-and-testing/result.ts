// A result is either a value or an error, and the type says which errors are possible.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Every way that paying for an order can turn out badly, as data.
export type PayError =
  | { kind: "order-not-found"; orderId: string }
  | { kind: "already-paid"; orderId: string }
  | { kind: "card-declined"; reason: "insufficient-funds" | "expired" | "suspected-fraud" }
  | { kind: "gateway-unavailable"; retryAfterSeconds: number };

export interface Receipt {
  orderId: string;
  amountCents: number;
  reference: string;
}

type Gateway = (amountCents: number) => Promise<{ status: "ok"; reference: string } | { status: "declined"; reason: "insufficient-funds" | "expired" | "suspected-fraud" } | { status: "down" }>;
const orders = new Map<string, { amountCents: number; paid: boolean }>([["o1", { amountCents: 550, paid: false }], ["o2", { amountCents: 120, paid: true }], ["o3", { amountCents: 900, paid: false }]]);

// The signature is the documentation: callers can see every outcome, and must deal with the union to reach the value.
export async function payForOrder(orderId: string, charge: Gateway): Promise<Result<Receipt, PayError>> {
  const order = orders.get(orderId);
  if (!order) return err({ kind: "order-not-found", orderId });
  if (order.paid) return err({ kind: "already-paid", orderId });
  const outcome = await charge(order.amountCents);
  if (outcome.status === "declined") return err({ kind: "card-declined", reason: outcome.reason });
  if (outcome.status === "down") return err({ kind: "gateway-unavailable", retryAfterSeconds: 30 });
  order.paid = true;
  return ok({ orderId, amountCents: order.amountCents, reference: outcome.reference });
}

// One place decides what each outcome means to the user. A new kind of error will not compile until it is added here.
export function toHttp(result: Result<Receipt, PayError>): { status: number; body: unknown } {
  if (result.ok) return { status: 200, body: result.value };
  const error = result.error;
  switch (error.kind) {
    case "order-not-found": return { status: 404, body: { error: `no order ${error.orderId}` } };
    case "already-paid": return { status: 409, body: { error: "this order has already been paid" } };
    case "card-declined": return { status: 402, body: { error: `card declined: ${error.reason}` } };
    case "gateway-unavailable": return { status: 503, body: { error: "payments are briefly unavailable", retryAfter: error.retryAfterSeconds } };
    default: { const missed: never = error; throw new Error(`unhandled: ${JSON.stringify(missed)}`); }
  }
}
