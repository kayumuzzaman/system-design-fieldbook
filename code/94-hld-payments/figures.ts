// Prints the data behind the chapter's charts as JSON: `node figures.ts > figures.json`. Seeded.
import { KEYS, run } from "./retries.ts";
import { makeDay, reconcile } from "./reconcile.ts";
const retries = [0.005, 0.01, 0.02, 0.05].map((rate) => ({ rate, rows: KEYS.map((k) => run(k, rate, 100_000, 42)) }));
const day = makeDay(3);
const found = Object.fromEntries(reconcile(day.ours, day.theirs, 0));
console.log(JSON.stringify({ retries, reconcile: { ours: day.ours.length, theirs: day.theirs.length, found, injected: day.injected } }));
