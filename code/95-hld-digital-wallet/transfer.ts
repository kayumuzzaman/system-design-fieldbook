// A transfer between two wallets as a PostgreSQL transaction, measured with pgbench. Not a test:
// `node transfer.ts <socket dir> <port>` needs a server, psql and pgbench. Prints JSON; one run.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [dir = "/tmp", port = "5432"] = process.argv.slice(2);
const conn = ["-h", dir, "-p", port];
const sql = (q: string) => execFileSync("psql", [...conn, "-d", "postgres", "-At", "-c", q], { encoding: "utf8" }).trim();
sql("DROP TABLE IF EXISTS wallets, entries");
sql("CREATE TABLE wallets (id int PRIMARY KEY, balance bigint NOT NULL CHECK (balance >= 0))");
sql("CREATE TABLE entries (id bigserial PRIMARY KEY, wallet int, amount bigint, at timestamptz DEFAULT now())");
sql("INSERT INTO wallets SELECT g, 1000000 FROM generate_series(1, 100000) g");
// Lock the two wallets in id order, so that two opposite transfers cannot deadlock.
const script = join(tmpdir(), "transfer.sql");
writeFileSync(script, `\\set a random(1, 100000)
\\set b random(1, 100000)
\\set amount random(1, 1000)
BEGIN;
SELECT id FROM wallets WHERE id IN (:a, :b) ORDER BY id FOR UPDATE;
UPDATE wallets SET balance = balance - :amount WHERE id = :a;
UPDATE wallets SET balance = balance + :amount WHERE id = :b;
INSERT INTO entries (wallet, amount) VALUES (:a, -:amount), (:b, :amount);
COMMIT;
`);
const text = execFileSync("pgbench", [...conn, "-n", "-c", "32", "-j", "4", "-T", "10", "-f", script, "postgres"], { encoding: "utf8" });
const totalAfter = sql("SELECT sum(balance) FROM wallets");
console.log(JSON.stringify({
  version: sql("SHOW server_version"), cores: Number(execFileSync("nproc", { encoding: "utf8" }).trim()), clients: 32, seconds: 10,
  transfersPerSecond: Math.round(Number(/tps = ([\d.]+)/.exec(text)?.[1])), latencyMs: Number(/latency average = ([\d.]+) ms/.exec(text)?.[1]),
  moneyConserved: totalAfter === String(100000 * 1000000),
}));
