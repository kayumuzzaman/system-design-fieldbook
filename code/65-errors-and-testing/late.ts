export interface Shipment {
  orderId: string;
  placedAt: Date;
  shippedAt: Date | null;
}

// Hard to test. The answer depends on two things that do not appear in the signature: today's date and a remote service.
export async function isLateHidden(orderId: string): Promise<boolean> {
  const response = await fetch(`https://shipping.example/orders/${orderId}`);
  const shipment = (await response.json()) as { placedAt: string; shippedAt: string | null };
  const days = (Date.now() - new Date(shipment.placedAt).getTime()) / 86_400_000;
  return shipment.shippedAt === null && days > 3;
}

// The decision, as a pure function: everything it needs comes in as arguments, and the answer is its only effect.
export function isLate(shipment: Shipment, now: Date, allowedDays = 3): boolean {
  if (shipment.shippedAt !== null) return false;
  const days = (now.getTime() - shipment.placedAt.getTime()) / 86_400_000;
  return days > allowedDays;
}

// The shell: fetches what the decision needs, calls it, and acts. Its collaborators are passed in.
export interface LateDeps {
  loadShipment(orderId: string): Promise<Shipment>;
  now(): Date;
  notify(orderId: string, message: string): Promise<void>;
}
export async function chaseLateOrder(orderId: string, deps: LateDeps): Promise<boolean> {
  const shipment = await deps.loadShipment(orderId);
  if (!isLate(shipment, deps.now())) return false;
  await deps.notify(orderId, "Your prints are taking longer than usual. We are on it.");
  return true;
}
