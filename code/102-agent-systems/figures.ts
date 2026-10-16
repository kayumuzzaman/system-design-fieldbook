// Prints the data behind the chapter's figures as JSON. Seeded, so the same on every run.
import { SUPPORT_POLICY } from "./agent.ts";
import { V1, V2 } from "./model.ts";
import { evaluate, passAtK, passHatK, wilson } from "./evaluate.ts";

const versions = { v1: evaluate(V1, SUPPORT_POLICY, 200)[0]!, v2: evaluate(V2, SUPPORT_POLICY, 200)[0]! };
const curves = Object.fromEntries(Object.entries(versions).map(([v, r]) => [v, {
  passes: r.passes, runs: r.runs,
  at: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => Number((passAtK(r.runs, r.passes, k) * 100).toFixed(1))),
  hat: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => Number((passHatK(r.runs, r.passes, k) * 100).toFixed(1))),
}]));
const intervals = Object.fromEntries(Object.entries({ v1: V1, v2: V2 }).map(([v, h]) => [v, [10, 30, 100, 200].map((n) => {
  const r = evaluate(h, SUPPORT_POLICY, n)[0]!;
  return { runs: n, passes: r.passes, interval: wilson(r.passes, n).map((x) => Number((x * 100).toFixed(1))) };
})]));
console.log(JSON.stringify({ curves, intervals }));
