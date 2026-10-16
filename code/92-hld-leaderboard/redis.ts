// Measures a real Redis sorted set. Not a test: it needs a Redis server, started for example with
//   redis-server --port 6392 --save "" --appendonly no
// then `node redis.ts 6392`. It prints JSON. The times depend on the machine; the chapter quotes one run.
import net from "node:net";
import { packed } from "./score.ts";
import { seeded } from "./random.ts";

type Reply = string | number | null | Reply[] | Error;

// The smallest useful client for Redis's protocol (RESP): send commands, read replies in order.
class Redis {
  private readonly socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private readonly waiting: ((r: Reply) => void)[] = [];
  constructor(port: number) {
    this.socket = net.connect(port, "127.0.0.1");
    this.socket.setNoDelay(true);
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const parsed = parse(this.buffer, 0);
        if (!parsed) break;
        this.buffer = this.buffer.subarray(parsed[1]);
        (this.waiting.shift() as (r: Reply) => void)(parsed[0]);
      }
    });
  }
  send(...args: (string | number)[]): Promise<Reply> {
    return this.many([args]).then((r) => r[0] as Reply);
  }
  // Pipelining: write many commands at once, then collect their replies.
  many(commands: (string | number)[][]): Promise<Reply[]> {
    const parts: string[] = [];
    for (const c of commands) {
      parts.push(`*${c.length}\r\n`);
      for (const a of c) { const s = String(a); parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`); }
    }
    const replies = commands.map(() => new Promise<Reply>((resolve) => this.waiting.push(resolve)));
    this.socket.write(parts.join(""));
    return Promise.all(replies);
  }
  close(): void {
    this.socket.end();
  }
}
function parse(b: Buffer, at: number): [Reply, number] | null {
  const eol = b.indexOf("\r\n", at);
  if (eol < 0) return null;
  const kind = String.fromCharCode(b[at] as number), line = b.toString("utf8", at + 1, eol);
  if (kind === "+") return [line, eol + 2];
  if (kind === "-") return [new Error(line), eol + 2];
  if (kind === ":") return [Number(line), eol + 2];
  if (kind === "$") {
    const len = Number(line);
    if (len < 0) return [null, eol + 2];
    if (b.length < eol + 2 + len + 2) return null;
    return [b.toString("utf8", eol + 2, eol + 2 + len), eol + 2 + len + 2];
  }
  if (kind === "*") {
    const n = Number(line), items: Reply[] = [];
    let pos = eol + 2;
    for (let i = 0; i < n; i += 1) { const p = parse(b, pos); if (!p) return null; items.push(p[0]); pos = p[1]; }
    return [items, pos];
  }
  throw new Error(`unexpected reply ${kind}`);
}
const usedMemory = async (r: Redis) => Number(/used_memory:(\d+)/.exec(String(await r.send("INFO", "memory")))?.[1]);

const port = Number(process.argv[2] ?? 6392);
const r = new Redis(port);
const random = seeded(92);
const out: Record<string, unknown> = {};
out.version = /redis_version:([\d.]+)/.exec(String(await r.send("INFO", "server")))?.[1];
await r.send("FLUSHALL");
out.listpackEntries = (await r.send("CONFIG", "GET", "zset-max-listpack-entries")) as Reply;

// memory for a million members
const N = 1_000_000;
const before = await usedMemory(r);
for (let start = 0; start < N; start += 1000) {
  const cmd: (string | number)[] = ["ZADD", "board:2026-10"];
  for (let i = start; i < start + 1000; i += 1) cmd.push(packed(Math.floor(random() * 20_000), Math.floor(random() * 2_678_400)), `p${i}`);
  await r.send(...cmd);
}
out.members = await r.send("ZCARD", "board:2026-10");
out.encoding = await r.send("OBJECT", "ENCODING", "board:2026-10");
out.bytesPerMember = Math.round(((await usedMemory(r)) - before) / N);

// throughput of score updates from one client, pipelined 100 at a time
{
  const t0 = performance.now();
  for (let k = 0; k < 2000; k += 1) {
    await r.many(Array.from({ length: 100 }, () => ["ZINCRBY", "board:2026-10", 30 * 4194304, `p${Math.floor(random() * N)}`]));
  }
  out.zincrbyPerSecondPipelined = Math.round(200_000 / ((performance.now() - t0) / 1000));
}
// round trips, one command at a time, on the same machine
async function timeEach(label: string, make: () => (string | number)[], times = 5000) {
  const t0 = performance.now();
  for (let i = 0; i < times; i += 1) await r.send(...make());
  out[label] = Math.round(((performance.now() - t0) * 1000) / times);   // microseconds
}
await timeEach("zrevrankMicros", () => ["ZREVRANK", "board:2026-10", `p${Math.floor(random() * N)}`]);
await timeEach("top10Micros", () => ["ZREVRANGE", "board:2026-10", 0, 9, "WITHSCORES"]);
await timeEach("pingMicros", () => ["PING"]);
// equal scores: Redis orders them by member name, and the reverse commands reverse that too
await r.send("ZADD", "tie", 500, "carol", 500, "alice", 500, "bob");
out.tieOrder = await r.send("ZREVRANGE", "tie", 0, -1);
await r.send("ZADD", "small", 1, "a", 2, "b");
out.smallEncoding = await r.send("OBJECT", "ENCODING", "small");
console.log(JSON.stringify(out));
r.close();
