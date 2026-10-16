import type { Clock } from "./clock.ts";
import { Worker, type Overflow } from "./queue.ts";

export type Level = "debug" | "info" | "warn" | "error";
const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Fields = Record<string, unknown>;
export interface LogRecord {
  readonly time: number;
  readonly level: Level;
  readonly msg: string;
  readonly fields: Fields;
}

// The three things that vary, each behind a small interface.
export interface Sink {
  write(record: LogRecord): void | Promise<void>; // where records go (a strategy)
}
export type Filter = (record: LogRecord) => LogRecord | null; // change it, pass it on, or stop it (a chain)
export type Format = (record: LogRecord) => string; // what a record looks like as text (a strategy)

// What a logger and all of its children share.
interface Core {
  readonly clock: Clock;
  readonly level: Level;
  readonly filters: readonly Filter[];
  readonly sinks: readonly Sink[];
  readonly failures: Map<Sink | "filters", number>;
  readonly report: (error: unknown) => void; // told once about each part that starts failing
}

export class Logger {
  private readonly core: Core;
  private readonly context: Fields;

  private constructor(core: Core, context: Fields) {
    this.core = core;
    this.context = context;
  }
  static create(options: { clock: Clock; sinks: Sink[]; level?: Level; filters?: Filter[]; report?: (error: unknown) => void }): Logger {
    const report = options.report ?? ((error: unknown) => console.error("logging failed:", error));
    const core = { clock: options.clock, level: options.level ?? "info", filters: options.filters ?? [], sinks: options.sinks, failures: new Map(), report };
    return new Logger(core, {});
  }

  // A logger that adds these fields to every record. It shares everything else with its parent.
  child(fields: Fields): Logger {
    return new Logger(this.core, { ...this.context, ...fields });
  }

  debug(msg: string, fields?: Fields) { return this.log("debug", msg, fields); }
  info(msg: string, fields?: Fields) { return this.log("info", msg, fields); }
  warn(msg: string, fields?: Fields) { return this.log("warn", msg, fields); }
  error(msg: string, fields?: Fields) { return this.log("error", msg, fields); }

  // Never throws. Returns a promise only when a sink is still working on the record, for callers that must wait.
  log(level: Level, msg: string, fields: Fields = {}): Promise<void> | undefined {
    if (RANK[level] < RANK[this.core.level]) return undefined; // the cheapest test first
    let record: LogRecord | null = { time: this.core.clock.now(), level, msg, fields: { ...this.context, ...fields } };
    try {
      for (const filter of this.core.filters) if ((record = filter(record)) === null) return undefined;
    } catch (error) {
      this.failed("filters", error); // a broken filter must not let an unredacted record through
      return undefined;
    }
    const waits: Promise<void>[] = [];
    for (const sink of this.core.sinks) {
      try {
        const done = sink.write(record);
        if (done) waits.push(done.catch((error) => this.failed(sink, error))); // never an unhandled rejection
      } catch (error) {
        this.failed(sink, error); // one sink failing does not stop the others
      }
    }
    return waits.length > 0 ? Promise.all(waits).then(() => undefined) : undefined;
  }

  private failed(part: Sink | "filters", error: unknown): void {
    const count = (this.core.failures.get(part) ?? 0) + 1;
    this.core.failures.set(part, count);
    if (count === 1) {
      try {
        this.core.report(error); // not through the logger itself, which may be what is broken
      } catch {
        // nothing left to tell
      }
    }
  }
  failures(part: Sink | "filters"): number {
    return this.core.failures.get(part) ?? 0;
  }
}

// ---- Filters
export const redact = (keys: readonly string[]): Filter => (record) => {
  const hidden = (value: unknown): unknown =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keys.includes(k) ? "[redacted]" : hidden(v)]))
      : value;
  return { ...record, fields: hidden(record.fields) as Fields };
};
export const sample = (level: Level, keep: number, random: () => number): Filter => (record) =>
  record.level !== level || random() < keep ? record : null;

// ---- Formats
export const json: Format = (record) =>
  JSON.stringify({ time: new Date(record.time).toISOString(), level: record.level, msg: record.msg, ...record.fields }, safe());
export const text: Format = (record) =>
  `${new Date(record.time).toISOString()} ${record.level.toUpperCase().padEnd(5)} ${record.msg}` +
  Object.entries(record.fields).map(([k, v]) => ` ${k}=${JSON.stringify(v, safe())}`).join("");

// JSON.stringify throws on a BigInt and on an object that contains itself. A log line must not.
function safe(): (this: unknown, key: string, value: unknown) => unknown {
  const path: unknown[] = []; // the objects from the top down to the one being written
  return function (this: unknown, _key: string, value: unknown) {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (value === null || typeof value !== "object") return value;
    while (path.length > 0 && path.at(-1) !== this) path.pop(); // `this` is the object that holds `value`
    if (path.includes(value)) return "[circular]";
    path.push(value);
    return value;
  };
}

// ---- Sinks
export class LineSink implements Sink {
  private readonly out: (line: string) => void;
  private readonly format: Format;
  constructor(out: (line: string) => void, format: Format = json) {
    this.out = out;
    this.format = format;
  }
  write(record: LogRecord): void {
    this.out(this.format(record));
  }
}

export class MemorySink implements Sink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

// A decorator: puts records in a bounded queue and hands them to the slower sink it wraps, later.
export class BufferedSink implements Sink {
  private readonly worker: Worker<LogRecord>;
  constructor(inner: Sink, capacity: number, overflow: Overflow, onError: (error: unknown) => void = () => {}) {
    this.worker = new Worker(capacity, overflow, (record) => inner.write(record), onError);
  }
  write(record: LogRecord): Promise<void> | undefined {
    return this.worker.put(record);
  }
  flush(): Promise<void> {
    return this.worker.flush(); // call before the process exits, or the buffered records are lost
  }
  get dropped(): number {
    return this.worker.dropped;
  }
}
