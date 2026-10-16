// One customer's server in its own thread, with its own connection to the shared database file.
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { bookTrusting, holdSeats, holdSeatsReadThenWrite } from "./sql.ts";

const { file, start, me } = workerData as { file: string; start: SharedArrayBuffer; me: number };
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout = 10000");
const gate = new Int32Array(start);
const pause = new Int32Array(new SharedArrayBuffer(4));
const work = () => void Atomics.wait(pause, 0, 0, 2); // two milliseconds of other work

parentPort?.on("message", (m: { round: number; mode: "readThenWrite" | "conditional"; seats: string[]; now: number }) => {
  parentPort?.postMessage({ armed: me });
  Atomics.wait(gate, 0, m.round - 1); // every worker waits here until the main thread opens the gate
  const holdId = `H${m.round}-${me}`;
  const held = m.mode === "conditional"
    ? holdSeats(db, "S1", holdId, m.seats, m.now, m.now + 600_000)
    : holdSeatsReadThenWrite(db, "S1", holdId, m.seats, m.now, m.now + 600_000, work);
  const booked = held && bookTrusting(db, "S1", m.seats, `B${m.round}-${me}`);
  parentPort?.postMessage({ me, held, booked });
});
