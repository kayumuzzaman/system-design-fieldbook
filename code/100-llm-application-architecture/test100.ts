import assert from "node:assert/strict";
import { countTokens, StubModel, tokenize } from "./model.ts";
import { simulate, summarize, workload, SMALL_MODEL, type Job } from "./server.ts";
import { Connection, parseEvents, relay, ResumableResponse } from "./stream.ts";
import { cacheKey, ResponseCache, SemanticCache, type ModelRequest } from "./cache.ts";
import { INTENTS } from "./questions.ts";
import { PrefixCache } from "./prefix.ts";
import { costOf, TokenBudget } from "./budget.ts";
import { Gateway, ScriptedProvider } from "./gateway.ts";
import { seeded, zipf } from "./random.ts";

// --- Tokens
{
  assert.deepEqual(tokenize("Share an album with family."), ["Share", " an", " album", " with", " family", "."]);
  assert.deepEqual(tokenize(" photographers"), [" photo", "graph", "ers"]);
  const sample = "When you delete a photo, it moves to the trash and stays there for 30 days. " +
    "During that time you can restore it from the trash on any of your devices. After 30 days it is removed for good, " +
    "and so are its edits and any copies in shared albums.";
  const tokens = countTokens(sample);
  console.log(`tokens: ${sample.length} characters, ${sample.split(" ").length} words, ${tokens} tokens, ` +
    `${(sample.length / tokens).toFixed(1)} characters a token`);
}

// --- The stub model: same prompt at temperature 0, same answer; max_tokens caps the length
{
  const model = new StubModel();
  const collect = async (prompt: string, maxTokens: number, temperature = 0, seed = 1) => {
    let text = "";
    for await (const t of model.generate(prompt, { maxTokens, temperature, seed })) text += t;
    return text;
  };
  assert.equal(await collect("How do I share an album?", 500), await collect("How do I share an album?", 500));
  assert.notEqual(await collect("How do I share an album?", 500, 1, 1), await collect("How do I share an album?", 500, 1, 2));
  assert.equal(countTokens(await collect("How do I share an album?", 10)), 10);
}

// --- Serving: one request alone, then batching
{
  const alone = simulate([{ id: 0, arrival: 0, input: 1500, output: 200 }], "continuous", 64).served[0] as Job & { firstToken: number; done: number };
  const perToken = SMALL_MODEL.stepMs + SMALL_MODEL.perSequenceMs;
  assert.equal(alone.firstToken.toFixed(1), (perToken + 1500 * SMALL_MODEL.prefillPerTokenMs).toFixed(1));
  assert.equal((alone.done - alone.firstToken).toFixed(1), (199 * perToken).toFixed(1));
  console.log(`one request alone: first token after ${alone.firstToken.toFixed(1)} ms, then one every ${perToken.toFixed(1)} ms, done after ${alone.done.toFixed(0)} ms`);

  // Eight requests, four slots: static batching waits for the longest in each batch
  const small: Job[] = [6, 2, 4, 3, 5, 2, 3, 4].map((output, id) => ({ id, arrival: 0, input: 100, output }));
  const st = simulate(small, "static", 4, SMALL_MODEL, true), co = simulate(small, "continuous", 4, SMALL_MODEL, true);
  assert.equal(st.iterations, 6 + 5);
  const padding = st.slots.flat().filter((c) => c?.padding).length;
  console.log(`8 requests in 4 slots: static ${st.iterations} iterations (${padding} slot-iterations of padding), continuous ${co.iterations}`);
  assert.ok(co.iterations < st.iterations);

  for (const rate of [2, 4, 10]) {
    const s = summarize(simulate(workload(rate, 300), "static", 64)), c = summarize(simulate(workload(rate, 300), "continuous", 64));
    console.log(`${rate} requests a second: static ${s.tokensPerSecond.toFixed(0)} tokens/s, first token p50 ${s.ttftP50.toFixed(0)} ms p95 ${s.ttftP95.toFixed(0)} ms; ` +
      `continuous ${c.tokensPerSecond.toFixed(0)} tokens/s, p50 ${c.ttftP50.toFixed(0)} ms p95 ${c.ttftP95.toFixed(0)} ms`);
    assert.ok(c.ttftP95 < s.ttftP95);
  }

  // A full queue: a larger batch gives more tokens a second in total and fewer to each user
  const backlog = workload(10, 100).map((j) => ({ ...j, arrival: 0 }));
  let before = { total: 0, each: Infinity };
  for (const b of [1, 8, 64, 256]) {
    const s = summarize(simulate(backlog, "continuous", b));
    console.log(`batch up to ${b}: ${s.tokensPerSecond.toFixed(0)} tokens/s in all, ${s.perUserTokensPerSecond.toFixed(1)} tokens/s for each user`);
    assert.ok(s.tokensPerSecond > before.total && s.perUserTokensPerSecond < before.each);
    before = { total: s.tokensPerSecond, each: s.perUserTokensPerSecond };
  }
}

// --- Streaming: passing on the cancel, resuming, stopping
{
  const prompt = "Explain how shared albums work.";
  const careless = new StubModel(), careful = new StubModel();
  await relay(careless, prompt, new Connection(20), false);
  await relay(careful, prompt, new Connection(20), true);
  const full = careless.naturalLength(prompt);
  assert.equal(careless.produced, full);
  assert.equal(careful.produced, 20);
  console.log(`browser leaves after 20 tokens: model produced ${careless.produced} tokens without passing on the cancel, ${careful.produced} with it`);

  const model = new StubModel();
  const response = new ResumableResponse(model, prompt);
  const first = new Connection(30);
  response.connect(first);
  await response.finished;
  const lastSeen = parseEvents(first.received.join("")).at(-1)?.id as number;
  const second = new Connection();
  response.connect(second, lastSeen); // reconnects with Last-Event-ID
  const all = parseEvents(first.received.join("") + second.received.join(""));
  assert.deepEqual(all.map((e) => e.id), Array.from({ length: full + 1 }, (_, i) => i + 1));
  assert.equal(model.produced, full);
  console.log(`dropped after event ${lastSeen}, reconnected: ${all.length} events, none missing or repeated; the model ran once (${model.produced} tokens)`);

  const r2 = new ResumableResponse(new StubModel(), prompt);
  const browser = new Connection(10);
  r2.connect(browser);
  browser.onClose(() => r2.stop()); // the user presses Stop after ten tokens
  const usage = await r2.finished;
  assert.equal(parseEvents(r2.events.join("")).at(-1)?.type, "stopped");
  assert.equal(usage.outputTokens, 10);
  console.log(`stop pressed after 10 tokens: ${usage.outputTokens} tokens produced and billed`);
}

// --- Caching whole responses
{
  const base: ModelRequest = { model: "stub-1", temperature: 0, maxTokens: 500, system: "You answer questions about the photo app.", messages: [{ role: "user", content: "How do I share an album?" }] };
  assert.equal(cacheKey(base), cacheKey({ ...base, messages: [{ role: "user", content: "  how do I share an   album?" }] }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, model: "stub-2" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, maxTokens: 100 }));
  const warm = new ResponseCache(10, 60_000);
  warm.put({ ...base, temperature: 0.7 }, "fresh", 0);
  assert.equal(warm.get({ ...base, temperature: 0.7 }, 1), undefined); // not cached above temperature 0
  warm.put(base, "answer", 0);
  assert.equal(warm.get(base, 59_999), "answer");
  assert.equal(warm.get(base, 60_000), undefined); // expired

  // 20,000 questions drawn from 240 by popularity, typed with stray capitals and spaces
  const verbs = ["share", "delete", "restore", "download", "rename", "move", "copy", "hide", "print", "crop", "rotate", "tag"];
  const things = ["a photo", "an album", "a video", "a shared album", "a memory", "a folder", "my library", "a screenshot", "a live photo", "a burst", "a panorama", "a portrait", "a slideshow", "a print order", "a backup", "a duplicate", "a favorite", "a comment", "a caption", "a location"];
  const questions = verbs.flatMap((v) => things.map((t) => `How do I ${v} ${t}?`));
  const random = seeded(100), pick = zipf(questions.length, 1, random);
  const typed = (q: string) => (random() < 0.5 ? q : q.toLowerCase()) + (random() < 0.3 ? " " : "");
  for (const norm of [false, true]) {
    const cache = new ResponseCache(100, 3_600_000, norm);
    const r = seeded(100);
    for (let i = 0; i < 20_000; i += 1) {
      const req = { ...base, messages: [{ role: "user" as const, content: typed(questions[pick()] as string) }] };
      if (cache.get(req, i) === undefined) cache.put(req, "answer", i);
      void r;
    }
    console.log(`response cache of 100 entries, ${norm ? "normalized" : "exact"} text: hit ratio ${(cache.hitRatio * 100).toFixed(1)}%`);
  }
}

// --- A semantic cache: one phrasing of each of 16 questions is cached, then the other 48 phrasings are asked
{
  const rows: string[] = [];
  for (const threshold of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
    const cache = new SemanticCache<string>(threshold);
    for (const i of INTENTS) cache.put(i.phrasings[0] as string, i.intent);
    let right = 0, wrong = 0;
    for (const i of INTENTS) for (const q of i.phrasings.slice(1)) {
      const got = cache.get(q);
      if (got === i.intent) right += 1; else if (got !== undefined) wrong += 1;
    }
    rows.push(`${threshold}: ${right} right, ${wrong} wrong`);
    if (threshold >= 0.8) assert.equal(wrong, 0);
  }
  const loose = new SemanticCache<string>(0.6);
  for (const i of INTENTS) loose.put(i.phrasings[0] as string, i.intent);
  assert.equal(loose.get("Delete an album but keep the photos"), "delete-photo"); // the opposite of what was asked
  console.log(`semantic cache, of 48 new phrasings: ${rows.join("; ")}`);
}

// --- Prefix caching: the same conversations, three prompt layouts
{
  const words = (n: number, r: () => number) => Array.from({ length: n }, () => " w" + Math.floor(r() * 5000));
  const system = words(1500, seeded(1));
  for (const layout of ["stable first", "user details first", "time first"]) {
    const random = seeded(2), cache = new PrefixCache(1_000_000);
    const history: string[][] = Array.from({ length: 200 }, () => []);
    let clock = 0;
    for (let turn = 0; turn < 4; turn += 1) for (let u = 0; u < 200; u += 1) {
      const question = words(25, random);
      const head = layout === "user details first" ? [" user" + u, " plan" + (u % 3)] : layout === "time first" ? [" at" + clock++] : [];
      cache.prefill([...head, ...system, ...(history[u] as string[]), ...question]);
      (history[u] as string[]).push(...question, ...words(200, random));
    }
    console.log(`prefix cache, 200 users, 4 turns, ${layout}: ${(cache.reusedShare * 100).toFixed(1)}% of prompt tokens reused`);
    if (layout === "time first") assert.equal(cache.reused, 0);
  }
}

// --- A token budget: ten calls start at once
{
  const outputs = [380, 610, 240, 900, 450, 520, 300, 700, 150, 480];
  for (const reserve of [false, true]) {
    const budget = new TokenBudget(10_000, 10_000);
    let admitted = 0, used = 0;
    for (const out of outputs) {
      const want = 1500 + 1000; // input plus max_tokens
      if (reserve) {
        if (!budget.reserve("ana", want, 0).ok) continue;
      } else if (budget.remaining("ana", 0) <= 0) continue;
      admitted += 1;
      used += 1500 + out;
    }
    // the calls finish; only now is the usage known
    if (!reserve) budget.settle("ana", 0, used, 0);
    console.log(`budget of 10,000 tokens, 10 calls at once, ${reserve ? "reserving first" : "charging after"}: ${admitted} admitted, ${used.toLocaleString("en-US")} tokens used`);
    assert.ok(reserve ? used <= 10_000 : used > 10_000);
  }
  const b = new TokenBudget(10_000, 10_000);
  assert.ok(b.reserve("ben", 2500, 0).ok);
  b.settle("ben", 2500, 1900, 0);
  assert.equal(b.remaining("ben", 0), 8100);
  const r = b.reserve("ben", 9000, 0);
  assert.ok(!r.ok && r.retryAfterMs === 5400); // 900 tokens at 10,000 a minute
  const price = { inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 10 };
  const one = costOf({ input: 600, cachedInput: 2400, output: 400 }, price);
  assert.equal(one.toFixed(4), "0.0057");
}

// --- The gateway: the first provider is overloaded from 10 s to 40 s
{
  for (const fallback of [false, true]) {
    const a = new ScriptedProvider("A", [{ from: 10_000, to: 40_000, status: 529 }]), b = new ScriptedProvider("B");
    const gateway = new Gateway(fallback ? [a, b] : [a]);
    let failed = 0, duringOutage = 0;
    for (let t = 0; t < 60_000; t += 100) {
      const before = a.calls;
      if (!gateway.complete("q", t).reply.ok) failed += 1;
      if (t >= 10_000 && t < 40_000) duringOutage += a.calls - before;
    }
    console.log(`600 calls, one every 100 ms, provider A down from 10 s to 40 s, ${fallback ? "with" : "without"} a fallback: ` +
      `${failed} failed; during the outage A received ${duringOutage} of 300 calls, B ${b.calls} calls in all`);
    assert.equal(duringOutage, 8); // 3 failures open the breaker, then one test call every 5 s
    if (fallback) assert.equal(failed, 0);
  }
  const bad = new ScriptedProvider("A", [{ from: 0, to: 1, status: 400 }]), other = new ScriptedProvider("B");
  assert.deepEqual(new Gateway([bad, other]).complete("q", 0).tried, ["A"]); // a bad request is not retried elsewhere
}
console.log("all ok");
