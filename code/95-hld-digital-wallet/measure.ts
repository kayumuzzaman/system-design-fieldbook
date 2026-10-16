// Timings for the chapter, printed as JSON: `node measure.ts > measure.json`. Not a test: the numbers
// depend on the machine and the disk, and the chapter quotes one run.
import { openSync, writeSync, fsyncSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Partition, replay, stateHash } from "./wallet.ts";
import { seeded } from "./random.ts";

const out: Record<string, unknown> = {};
// 1. Applying events in memory, one partition, one thread
const p = new Partition(), random = seeded(1);
for (let i = 0; i < 100_000; i += 1) { p.handle({ type: "open", account: `w${i}` }); p.handle({ type: "deposit", account: `w${i}`, amount: 50_000, ref: `d${i}` }); }
let t0 = performance.now();
for (let t = 0; t < 1_000_000; t += 1) p.handle({ type: "transfer", id: `t${t}`, from: `w${Math.floor(random() * 100_000)}`, to: `w${Math.floor(random() * 100_000)}`, amount: 1 + Math.floor(random() * 2_000) });
out.decideAndApplyPerSecond = Math.round(1_000_000 / ((performance.now() - t0) / 1000));
out.events = p.log.length;
t0 = performance.now();
const full = replay(p.log);
out.fullReplayMs = Math.round(performance.now() - t0);
const cut = p.log.length - 100_000;
const snap = replay(p.log.slice(0, cut));
t0 = performance.now();
const tail = replay(p.log, snap, cut);
out.replayFromSnapshotMs = Math.round(performance.now() - t0);
out.sameState = stateHash(full) === stateHash(tail) && stateHash(full) === stateHash(p.state);

// 2. Making events durable: append to a file and fsync, one fsync per batch (group commit)
const file = join(tmpdir(), `wallet-log-${process.pid}`);
const line = JSON.stringify({ type: "Transferred", id: "t123456", from: "w12345", to: "w67890", amount: 1234 }) + "\n";
out.durable = [1, 10, 100, 1000].map((batch) => {
  const fd = openSync(file, "w");
  const events = batch === 1 ? 2_000 : batch === 10 ? 20_000 : 200_000;
  const start = performance.now();
  for (let i = 0; i < events; i += batch) { writeSync(fd, line.repeat(batch)); fsyncSync(fd); }
  const seconds = (performance.now() - start) / 1000;
  closeSync(fd);
  return { batch, eventsPerSecond: Math.round(events / seconds), fsyncMs: Math.round(((seconds * 1000) / (events / batch)) * 100) / 100 };
});
rmSync(file);
console.log(JSON.stringify(out));
