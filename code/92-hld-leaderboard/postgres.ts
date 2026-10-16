// Measures the relational alternative on a real PostgreSQL. Not a test: it needs a server and psql,
// for example a scratch cluster: `node postgres.ts <socket dir> <port>`. It prints JSON. The times
// depend on the machine; the chapter quotes one run.
import { execFileSync } from "node:child_process";

const [dir = "/tmp", port = "5432"] = process.argv.slice(2);
const sql = (q: string) => execFileSync("psql", ["-h", dir, "-p", port, "-d", "postgres", "-At", "-c", q], { encoding: "utf8" }).trim();
// The execution time PostgreSQL reports for a query, best of three (the table is in memory by then).
const ms = (q: string) => Math.min(...[1, 2, 3].map(() => Number(/Execution Time: ([\d.]+) ms/.exec(sql(`EXPLAIN (ANALYZE) ${q}`))?.[1])));

const out: Record<string, unknown> = { version: sql("SHOW server_version") };
sql("DROP TABLE IF EXISTS scores");
// One row per player: points, the second of the month they were reached, and both packed into one
// number as in score.ts. Points are log-normal, like the simulated month.
sql(`CREATE TABLE scores (player_id bigint PRIMARY KEY, points int NOT NULL, reached int NOT NULL, score bigint NOT NULL)`);
sql(`SELECT setseed(0.42)`);
sql(`INSERT INTO scores
     SELECT g, p, r, p::bigint * 4194304 + (4194303 - r)
     FROM (SELECT g, least(2000000, floor(exp(7 + 1.2 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()))))::int AS p,
                  floor(random() * 2678400)::int AS r
           FROM generate_series(1, 1000000) g) t`);
sql(`CREATE INDEX scores_by_score ON scores (score DESC)`);
sql(`VACUUM ANALYZE scores`);
out.rows = Number(sql("SELECT count(*) FROM scores"));

out.top10 = ms(`SELECT player_id, points FROM scores ORDER BY score DESC LIMIT 10`);
// A rank by counting: how long it takes depends on how many players are above.
const rankCost: { rank: number; ms: number }[] = [];
for (const rank of [10, 1_000, 10_000, 100_000, 500_000, 999_000]) {
  const s = sql(`SELECT score FROM scores ORDER BY score DESC OFFSET ${rank - 1} LIMIT 1`);
  rankCost.push({ rank, ms: ms(`SELECT count(*) + 1 FROM scores WHERE score > ${s}`) });
}
out.rankByCount = rankCost;
const mid = sql(`SELECT score FROM scores ORDER BY score DESC OFFSET 499999 LIMIT 1`);
out.neighbors = ms(`(SELECT player_id FROM scores WHERE score > ${mid} ORDER BY score ASC LIMIT 5)
                    UNION ALL (SELECT player_id FROM scores WHERE score < ${mid} ORDER BY score DESC LIMIT 5)`);
out.rankByWindow = ms(`SELECT r FROM (SELECT player_id, rank() OVER (ORDER BY score DESC) AS r FROM scores) t WHERE player_id = 123456`);
out.update = ms(`UPDATE scores SET points = points + 30, score = score + 30 * 4194304 WHERE player_id = 123456`);
// A rank table rebuilt every few minutes: cheap reads, ranks as old as the last rebuild.
sql(`DROP TABLE IF EXISTS ranks`);
const t0 = performance.now();
sql(`CREATE TABLE ranks AS SELECT player_id, row_number() OVER (ORDER BY score DESC) AS rank FROM scores`);
sql(`ALTER TABLE ranks ADD PRIMARY KEY (player_id)`);
out.rebuildRanksMs = Math.round(performance.now() - t0);
out.rankFromTable = ms(`SELECT rank FROM ranks WHERE player_id = 123456`);
console.log(JSON.stringify(out));
