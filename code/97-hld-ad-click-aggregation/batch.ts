// The batch recount: all raw clicks for the period, each click id once, counted by ad and window.
// It runs after the period is over, so lateness does not exist for it. It is the reference.
import type { Click } from "./clicks.ts";

export function recount(clicks: readonly Click[], windowMs: number): Map<string, number> {
  const seen = new Set<number>();
  const out = new Map<string, number>();
  for (const c of clicks) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const key = `${c.ad}@${c.time - (c.time % windowMs)}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export interface Comparison { keys: number; matching: number; missing: number; extra: number; keysMissing: number; keysExtra: number }

// Reconciliation: compare what the stream stored with the recount, key by key.
export function reconcile(stream: ReadonlyMap<string, number>, batch: ReadonlyMap<string, number>): Comparison {
  let matching = 0, missing = 0, extra = 0, keysMissing = 0, keysExtra = 0;
  const keys = new Set([...stream.keys(), ...batch.keys()]);
  for (const k of keys) {
    const s = stream.get(k) ?? 0, b = batch.get(k) ?? 0;
    if (s === b) matching += 1;
    else if (s < b) { missing += b - s; keysMissing += 1; }
    else { extra += s - b; keysExtra += 1; }
  }
  return { keys: keys.size, matching, missing, extra, keysMissing, keysExtra };
}
