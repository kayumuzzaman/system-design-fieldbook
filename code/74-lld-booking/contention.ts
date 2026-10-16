// Several threads, each with its own connection to one database file, try to hold the same seats at the same instant.
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { addShow, createTables } from "./sql.ts";

export interface Round {
  readonly held: number; // customers told they hold the seats
  readonly booked: number; // bookings the database accepted
}

type Reply = { armed?: number; held?: boolean; booked?: boolean };
const next = (w: Worker, want: (m: Reply) => boolean) =>
  new Promise<Reply>((resolve, reject) => {
    const listen = (m: Reply) => { if (want(m)) { w.off("message", listen); w.off("error", reject); resolve(m); } };
    w.on("message", listen);
    w.once("error", reject);
  });

export async function contend(file: string, threads: number, rounds: number, mode: "readThenWrite" | "conditional", seats: string[]): Promise<Round[]> {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  createTables(db);
  addShow(db, "S1", Array.from({ length: 10 }, (_, i) => `C${i + 1}`));
  const start = new SharedArrayBuffer(4);
  const gate = new Int32Array(start);
  const workers = Array.from({ length: threads }, (_, me) => new Worker(new URL("./sqlworker.ts", import.meta.url), { workerData: { file, start, me } }));
  const results: Round[] = [];
  try {
    for (let round = 1; round <= rounds; round += 1) {
      db.exec("DELETE FROM booked_seats; UPDATE show_seats SET status = 'available', hold_id = NULL, held_until = NULL");
      const armed = workers.map((w) => next(w, (m) => m.armed !== undefined));
      const answers = workers.map((w) => next(w, (m) => m.armed === undefined));
      for (const w of workers) w.postMessage({ round, mode, seats, now: 1_000 });
      await Promise.all(armed);
      await new Promise((resolve) => setTimeout(resolve, 5)); // let every worker reach its wait
      Atomics.store(gate, 0, round); // open the gate: all of them go at once
      Atomics.notify(gate, 0);
      const r = await Promise.all(answers);
      results.push({ held: r.filter((a) => a.held).length, booked: r.filter((a) => a.booked).length });
    }
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
    db.close();
  }
  return results;
}
