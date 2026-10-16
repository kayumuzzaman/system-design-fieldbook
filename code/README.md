# Code for Parts IX to XII

Every TypeScript listing in the low-level design chapters (Parts IX and X) is an excerpt of a file in
this folder. In the high-level case studies (Part XI) and the chapters on AI systems (Part XII) the code
is small, seeded simulations and models that make each chapter's numbers checkable. Every result a
chapter quotes ("in a test, …", "in the simulation, …") is the output of the `test*.ts` file beside it,
or of the `figures.ts` file that prints the data its figures are drawn from.

```
npm install      # typescript and @types/node, nothing else
npm test         # type-check everything, then run every chapter's tests
sh check.sh 60   # type-check everything, run chapter 60 only
```

Needs Node 22.18 or later. Node 24 is recommended. The files are run directly with `node file.ts`: Node
removes the type annotations and runs what is left. That works because the code keeps to
"erasable" TypeScript, which `tsconfig.json` enforces with `erasableSyntaxOnly`:

- no `enum` (string-literal unions instead)
- no constructor parameter properties (fields are declared, then assigned in the constructor)
- no runtime `namespace`
- `import type` for types, and imports written with the `.ts` extension

Notes on particular chapters:

- `60-structural-patterns/mem.ts` is a measurement, not a test. Run it with
  `node --expose-gc 60-structural-patterns/mem.ts`. Its numbers depend on the Node version and the machine.
- `62-concurrency-in-code` starts worker threads and prints timings. The timings in the chapter are
  from a two-core machine and will differ on yours. The plain shared counter gives a different wrong
  total on every run, which is the point of that test.
- `64-application-architecture` uses Node's built-in `node:sqlite` module, which needs Node 22.13 or
  later and prints an "experimental" warning on Node 22 and 24. `node 64-application-architecture/main.ts`
  starts the example server on port 8080 and creates `orders.db` in the current folder.
- `67-lld-parking-lot` also uses `node:sqlite`, for the atomic claim of a spot.
- Some files print data instead of testing, and the chapters' figures are drawn from their output:
  `67-lld-parking-lot/fees.ts`, `68-lld-elevator/trace.ts`, `70-lld-lru-cache/trace.ts`, `71-lld-rate-limiter/figures.ts`, `72-lld-splitwise/figures.ts`,
  and `68-lld-elevator/test68.ts --json`.
- `70-lld-lru-cache/bench.ts` and `70-lld-lru-cache/mapfront.ts` are measurements. Run them with `node`. The
  times in the chapter are from one run on a two-core machine and will differ on yours.
- `71-lld-rate-limiter/memory.ts` measures bytes per client for each algorithm. Run it with
  `node --expose-gc 71-lld-rate-limiter/memory.ts`.
- Every folder from chapter 71 on has a `figures.ts` that prints the JSON its figures are drawn from,
  for example `node 77-hld-url-shortener/figures.ts`. Chapter 95 is the exception: its figures use the
  output of `test95.ts` and `measure.ts`.
- Part XII uses a stand-in model, a small deterministic program, never a network call, so its results
  are the same on every run.
- Some files are measurements of real software, not tests, and are not run by `npm test`. They need a
  server running on your machine, take its address as arguments, print JSON, and give different
  numbers on different machines; the chapters quote one run:
  `92-hld-leaderboard/redis.ts` (a Redis server), `92-hld-leaderboard/postgres.ts`,
  `93-hld-ticket-booking/hotrow.ts` and `95-hld-digital-wallet/transfer.ts` (PostgreSQL with `psql`
  and `pgbench`). The header comment of each file gives the command.
- Other timings are measured in Node alone and also differ between machines:
  `95-hld-digital-wallet/measure.ts`, `98-hld-metrics-and-logging/logbench.ts` and the `bench.ts` files.
- The `.mmd` files in `58-uml-diagrams` are the Mermaid sources shown in that chapter.
