// Measures one hot row against inventory split over several rows, on a real PostgreSQL, with pgbench.
// Not a test: `node hotrow.ts <socket dir> <port>` needs a server, psql and pgbench. Prints JSON; the
// numbers depend on the machine, and the chapter quotes one run.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [dir = "/tmp", port = "5432"] = process.argv.slice(2);
const conn = ["-h", dir, "-p", port];
const sql = (q: string) => execFileSync("psql", [...conn, "-d", "postgres", "-At", "-c", q], { encoding: "utf8" }).trim();
// Each transaction takes one ticket from a random row of the section, and records the hold.
const script = join(tmpdir(), "take-one.sql");
writeFileSync(script, `\\set row random(1, :rows)
BEGIN;
UPDATE inventory SET remaining = remaining - 1 WHERE section = 'A' AND part = :row AND remaining > 0;
INSERT INTO holds (section, part, at) VALUES ('A', :row, now());
COMMIT;
`);
const out: Record<string, unknown> = { version: sql("SHOW server_version"), cores: Number(execFileSync("nproc", { encoding: "utf8" }).trim()) };
const runs: { rows: number; clients: number; tps: number; latencyMs: number }[] = [];
for (const rows of [1, 4, 16, 64]) {
  sql("DROP TABLE IF EXISTS inventory, holds");
  sql("CREATE TABLE inventory (section text, part int, remaining int, PRIMARY KEY (section, part))");
  sql("CREATE TABLE holds (id bigserial PRIMARY KEY, section text, part int, at timestamptz)");
  // a million tickets in the section, split evenly, so that none of the runs sells out
  sql(`INSERT INTO inventory SELECT 'A', g, 1000000 / ${rows} FROM generate_series(1, ${rows}) g`);
  const text = execFileSync("pgbench", [...conn, "-n", "-c", "32", "-j", "4", "-T", "5", "-D", `rows=${rows}`, "-f", script, "postgres"], { encoding: "utf8" });
  runs.push({
    rows, clients: 32,
    tps: Math.round(Number(/tps = ([\d.]+)/.exec(text)?.[1])),
    latencyMs: Number(/latency average = ([\d.]+) ms/.exec(text)?.[1]),
  });
}
out.runs = runs;
console.log(JSON.stringify(out));
