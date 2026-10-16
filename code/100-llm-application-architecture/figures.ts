// Prints the data behind the chapter's figures as JSON. Everything here is simulated, so it is the same on every run.
import { simulate, summarize, workload, SMALL_MODEL, type Job } from "./server.ts";
import { SemanticCache } from "./cache.ts";
import { INTENTS } from "./questions.ts";

const small: Job[] = [6, 2, 4, 3, 5, 2, 3, 4].map((output, id) => ({ id, arrival: 0, input: 100, output }));
const grid = (policy: "static" | "continuous") => simulate(small, policy, 4, SMALL_MODEL, true).slots;

const load = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 11, 12].map((rate) => {
  const row = (p: "static" | "continuous") => {
    const s = summarize(simulate(workload(rate, 300), p, 64));
    return { tokensPerSecond: Math.round(s.tokensPerSecond), ttftP50: Math.round(s.ttftP50), ttftP95: Math.round(s.ttftP95) };
  };
  return { rate, static: row("static"), continuous: row("continuous") };
});
const backlog = workload(10, 100).map((j) => ({ ...j, arrival: 0 }));
const batch = [1, 2, 4, 8, 16, 32, 64, 128, 256].map((b) => {
  const s = summarize(simulate(backlog, "continuous", b));
  return { batch: b, total: Math.round(s.tokensPerSecond), each: Number(s.perUserTokensPerSecond.toFixed(1)) };
});
const semantic = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map((threshold) => {
  const cache = new SemanticCache<string>(threshold);
  for (const i of INTENTS) cache.put(i.phrasings[0] as string, i.intent);
  let right = 0, wrong = 0, miss = 0;
  const mistakes: string[] = [];
  for (const i of INTENTS) for (const q of i.phrasings.slice(1)) {
    const got = cache.get(q);
    if (got === undefined) miss += 1; else if (got === i.intent) right += 1; else { wrong += 1; mistakes.push(`${q} -> ${got}`); }
  }
  return { threshold, right, wrong, miss, mistakes };
});
// Memory for the attention keys and values of one token: two (keys and values) x layers x key-value heads x
// numbers per head x bytes per number. Layer and head counts are those of Llama 3 8B and 70B.
const kv = (layers: number, kvHeads: number, headDim: number, bytes = 2) => 2 * layers * kvHeads * headDim * bytes;
const kvCache = { small: kv(32, 8, 128), large: kv(80, 8, 128) };
console.log(JSON.stringify({ grid: { static: grid("static"), continuous: grid("continuous"), outputs: small.map((j) => j.output) }, load, batch, semantic, kvCache }));
