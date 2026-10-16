import assert from "node:assert/strict";
import { fixedWindow, gcra, slidingCounter, slidingLog, tokenBucket, type Algorithm, type Decision } from "./algorithms.ts";
import { boundary, run, seeded, worstSpans } from "./compare.ts";
import { allOf, eachInTurn, KeyedLimiter, type Limit } from "./limiter.ts";
import { headersFor, rateLimited, ruleFor, type Request, type Rule } from "./http.ts";
import { atomicAcquire, racyAcquire, SlowStore } from "./store.ts";

const allowed = (ds: readonly Decision[]) => ds.map((d) => (d.allowed ? 1 : 0)).join("");

// --- Each algorithm by hand: 3 requests a second
{
  const at = [0, 0, 0, 0, 334, 335];
  assert.equal(allowed(run(tokenBucket(3, 1000), at)), "111010");
  assert.deepEqual(run(tokenBucket(3, 1000), at).map((d) => d.remaining), [2, 1, 0, 0, 0, 0]);
  assert.equal(run(tokenBucket(3, 1000), at)[3]?.retryAfterMs, 334); // one token takes 333.3 ms to come back
  assert.equal(allowed(run(gcra(3, 1000), at)), "111010");
  // the time until the whole allowance is back: one token's worth for each token used
  assert.deepEqual(run(tokenBucket(3, 1000), [0, 0, 0, 0]).map((d) => d.resetMs), [334, 667, 1000, 1000]);
  assert.deepEqual(run(gcra(3, 1000), [0, 0, 0, 0]).map((d) => d.resetMs), [334, 667, 1000, 1000]);
  assert.deepEqual(run(fixedWindow(3, 1000), [0, 1, 2, 3]).map((d) => d.resetMs), [1000, 999, 998, 997]);
  assert.deepEqual(run(slidingLog(3, 1000), [0, 1, 2, 3]).map((d) => d.resetMs), [1000, 1000, 1000, 999]);
  assert.equal(run(gcra(3, 1000), at)[3]?.retryAfterMs, 334);

  const edge = [990, 995, 999, 1000, 1001, 1002]; // three at the end of one window, three at the start of the next
  assert.equal(allowed(run(fixedWindow(3, 1000), edge)), "111111"); // six in 12 ms
  assert.equal(allowed(run(slidingLog(3, 1000), edge)), "111000");
  assert.equal(allowed(run(slidingCounter(3, 1000), edge)), "111000");
  assert.equal(run(fixedWindow(3, 1000), [0, 1, 2, 3])[3]?.retryAfterMs, 997);  // until the window ends
  assert.equal(run(slidingLog(3, 1000), [0, 1, 2, 3])[3]?.retryAfterMs, 997);   // until the request at 0 leaves
  assert.equal(allowed(run(slidingLog(3, 1000), [0, 1, 2, 999, 1000])), "11101");

  // the worked example from the resilience chapter: limit 50, previous minute 42, this minute 18, 15 seconds in
  const counter = slidingCounter(50, 60_000);
  let s = counter.start(0);
  for (let i = 0; i < 42; i += 1) s = counter.decide(s, 1000 + i, 1).next;
  for (let i = 0; i < 18; i += 1) {
    const step = counter.decide(s, 74_500 + i, 1);
    assert.equal(step.decision.allowed, true);
    s = step.next;
  }
  assert.deepEqual(s, { start: 60_000, current: 18, previous: 42 });
  // 42 x 45/60 + 18 = 49.5. That chapter's version allows while the estimate is below 50; this one requires the
  // estimate after the request, 50.5, to stay within 50, as every other algorithm here does. They differ below one request.
  assert.equal(counter.decide(s, 75_000, 1).decision.allowed, false);
  assert.equal(counter.decide(s, 75_800, 1).decision.allowed, true); // 42 x 44.2/60 + 18 + 1 = 49.94

  // cost: an expensive request takes five
  assert.equal(allowed(run(tokenBucket(10, 1000), [0, 0, 0], 5)), "110");
}

// --- Token bucket and GCRA are the same algorithm: identical decisions on random traffic
for (const [limit, windowMs] of [[10, 1000], [100, 60_000], [5, 1000]] as const) {
  const random = seeded(limit);
  let t = 0;
  const times = Array.from({ length: 50_000 }, () => (t += Math.floor(random() * random() * 400)));
  assert.deepEqual(run(gcra(limit, windowMs), times), run(tokenBucket(limit, windowMs), times));
}
console.log("token bucket and GCRA: identical over 3 x 50,000 requests");

// --- How far over the limit can each algorithm go? The most requests allowed in any one-second span
{
  const worst = worstSpans();
  console.log("most allowed in any 1 s span, limit 10:", JSON.stringify(worst));
  assert.equal(worst["sliding log"]?.span, 10); // exact
  for (const name of ["token bucket", "GCRA", "fixed window", "sliding counter"]) assert.ok((worst[name]?.span as number) <= 20);
  assert.deepEqual(worst["token bucket"], worst["GCRA"]);

  const { rows } = boundary();
  const pattern = (name: string) => rows.find((r) => r.name === name)?.allowed.map((a) => (a ? 1 : 0)).join("");
  assert.equal(pattern("token bucket"), pattern("GCRA"));
  console.log("boundary pattern:", rows.map((r) => `${r.name} ${r.allowed.map((a) => (a ? 1 : 0)).join("")}`).join(" | "));
}

// --- Forgetting keys: a bounded map is harmless while it holds every client active within one window
{
  // `perMs` requests every millisecond, each from a client chosen at random
  const traffic = (clients: number, n: number, perMs: number, seed: number) => {
    const random = seeded(seed);
    return Array.from({ length: n }, (_, i) => ({ key: `c${Math.floor(random() * clients)}`, now: Math.floor(i / perMs) }));
  };
  const share = (limiter: KeyedLimiter<unknown>, reqs: readonly { key: string; now: number }[]) =>
    reqs.map((r) => (limiter.tryAcquire(r.key, r.now).allowed ? 1 : 0)).join("");
  const algorithm = tokenBucket(10, 1000) as Algorithm<unknown>;

  // 30 clients who take turns: at any moment 8 are active, and the group moves on by one every 250 ms.
  // No one-second span sees more than 12 different clients, and each one comes back after a few seconds away.
  const random = seeded(3);
  const turns = Array.from({ length: 60_000 }, (_, now) => ({ key: `c${(Math.floor(now / 250) + Math.floor(random() * 8)) % 30}`, now }));
  const everything = share(new KeyedLimiter(algorithm, 1_000_000), turns);
  assert.equal(share(new KeyedLimiter(algorithm, 12), turns), everything);   // room for every client of any one window
  assert.notEqual(share(new KeyedLimiter(algorithm, 8), turns), everything);  // too little: some come back to a fresh bucket

  // 1,000 clients, each asking for about twice its limit, and room to remember only some of them
  const thousand = traffic(1000, 200_000, 20, 2);
  const results: Record<string, number> = {};
  for (const maxKeys of [2000, 1000, 900, 500]) {
    const limiter = new KeyedLimiter(algorithm, maxKeys);
    const ok = share(limiter, thousand).split("").filter((c) => c === "1").length;
    results[maxKeys] = Math.round((ok / thousand.length) * 1000) / 10;
    assert.ok(limiter.keys <= maxKeys);
  }
  console.log("percent of requests allowed, 1,000 clients, by keys remembered:", JSON.stringify(results));
  assert.equal(results[2000], results[1000]);
  assert.equal(results[500], 100); // every client was forgotten before it had used its ten
}

// --- Defensive edges: a cost that can never pass, and a clock that steps back
{
  const limiter = new KeyedLimiter(tokenBucket(10, 1000) as Algorithm<unknown>, 100);
  assert.throws(() => limiter.check("a", 0, 11), RangeError);
  assert.throws(() => limiter.check("a", 0, 0), RangeError);
  assert.throws(() => limiter.check("a", 0, 1.5), RangeError);

  const windows = new KeyedLimiter(fixedWindow(3, 1000) as Algorithm<unknown>, 100);
  for (const t of [1000, 1001, 1002]) assert.equal(windows.tryAcquire("a", t).allowed, true);
  assert.equal(windows.tryAcquire("a", 999).allowed, false); // without the guard: a new window, and a fresh three
  const bare = fixedWindow(3, 1000);
  let s = bare.start(1000);
  for (const t of [1000, 1001, 1002]) s = bare.decide(s, t, 1).next;
  assert.equal(bare.decide(s, 999, 1).decision.allowed, true); // the algorithm alone is fooled
}

// --- Several limits at once: a spammer must not use up the shared limit with requests that are refused anyway
{
  const simulate = (combine: typeof allOf) => {
    const limits: Limit[] = [
      { name: "service", limiter: new KeyedLimiter(tokenBucket(100, 1000) as Algorithm<unknown>, 10), keyOf: () => "all" },
      { name: "user", limiter: new KeyedLimiter(tokenBucket(10, 1000) as Algorithm<unknown>, 1000), keyOf: (r) => r.user },
    ];
    const decide = combine(limits);
    const served = { spammer: 0, others: 0, othersAsked: 0 };
    for (let now = 0; now < 10_000; now += 1) {
      if (decide({ user: "spammer", route: "/" }, now).decision.allowed) served.spammer += 1; // one request every millisecond
      if (now % 22 === 0) { // nine other users, about five requests a second each
        const user = `u${(now / 22) % 9}`;
        served.othersAsked += 1;
        if (decide({ user, route: "/" }, now).decision.allowed) served.others += 1;
      }
    }
    return served;
  };
  const right = simulate(allOf);
  const wrong = simulate(eachInTurn);
  console.log("ten seconds, all of:", JSON.stringify(right), " each in turn:", JSON.stringify(wrong));
  assert.equal(right.others, right.othersAsked);   // every ordinary request served
  assert.ok(right.spammer <= 110);                  // ten a second, plus the first full bucket
  assert.ok(wrong.others < right.others / 4);       // the spammer's refused requests drained the shared limit
}

// --- Rules and the HTTP layer
{
  const rules: Rule[] = [
    { name: "login", matches: (r) => r.route === "POST /login", perMinute: 5, keyOf: (r) => `ip:${r.ip}` },
    { name: "upload", matches: (r) => r.route.startsWith("POST /photos"), perMinute: 20, keyOf: (r) => `user:${r.user}:upload` },
    { name: "default", matches: () => true, perMinute: 600, keyOf: (r) => `user:${r.user}` },
  ];
  const req = (route: string, user = "ana", ip = "203.0.113.9"): Request => ({ route, user, ip });
  assert.equal(ruleFor(rules, req("POST /login")).name, "login");
  assert.equal(ruleFor(rules, req("POST /photos/7")).name, "upload");
  assert.equal(ruleFor(rules, req("GET /albums")).name, "default");
  assert.equal(ruleFor(rules, req("POST /login")).keyOf(req("POST /login", "", "198.51.100.4")), "ip:198.51.100.4");
  assert.throws(() => ruleFor(rules.slice(0, 2), req("GET /albums")), /no rate limit rule/);

  const limiters = new Map(rules.map((r) => [r.name, new KeyedLimiter(tokenBucket(r.perMinute, 60_000) as Algorithm<unknown>, 10_000)]));
  let now = 0;
  const decide = (r: Request) => {
    const rule = ruleFor(rules, r);
    return { rule, decision: (limiters.get(rule.name) as KeyedLimiter<unknown>).tryAcquire(rule.keyOf(r), now) };
  };
  let calls = 0;
  const login = rateLimited(() => { calls += 1; return { status: 200, headers: {}, body: "welcome" }; }, decide);
  const statuses = Array.from({ length: 7 }, () => login(req("POST /login")).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(calls, 5); // the handler never ran for a refused request
  const refused = login(req("POST /login"));
  // nothing left, one request possible in 12 s, and all five back in 60 s
  assert.deepEqual(refused.headers, { "RateLimit-Policy": "\"login\";q=5;w=60", "RateLimit": "\"login\";r=0;t=60", "Retry-After": "12" });
  now = 12_000;
  assert.equal(login(req("POST /login")).status, 200); // one token back after 12 seconds
  assert.equal(login(req("POST /login", "ana", "198.51.100.4")).status, 200); // another address has its own allowance
  assert.deepEqual(headersFor({ allowed: true, remaining: 37, retryAfterMs: 0, resetMs: 22_000 }, "default", 100, 60, 22),
    { "RateLimit-Policy": "\"default\";q=100;w=60", "RateLimit": "\"default\";r=37;t=22" });
}

// --- Concurrency: twenty requests at once against a remote store, with ten allowed
{
  const algorithm = tokenBucket(10, 1000);
  const racyStore = new SlowStore<{ credit: number; at: number }>(1);
  const racy = await Promise.all(Array.from({ length: 20 }, () => racyAcquire(racyStore, algorithm, "ana", 0)));
  const atomicStore = new SlowStore<{ credit: number; at: number }>(1);
  const atomic = await Promise.all(Array.from({ length: 20 }, () => atomicAcquire(atomicStore, algorithm, "ana", 0)));
  const count = (ds: Decision[]) => ds.filter((d) => d.allowed).length;
  console.log(`twenty at once, limit 10: read-then-write allowed ${count(racy)}, atomic update allowed ${count(atomic)}`);
  assert.equal(count(racy), 20); // all twenty read the full bucket before any of them wrote
  assert.equal(count(atomic), 10);
}

console.log("all rate limiter tests passed");
