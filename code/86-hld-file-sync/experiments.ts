import { chunk, ContentDefinedChunker, FixedChunker, type Chunker } from "./chunking.ts";
import { BlockStore } from "./blocks.ts";
import { Namespace, type Policy } from "./metadata.ts";
import { Device } from "./device.ts";

// A small seeded generator, so that every run sees the same "random" data.
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
export function randomBytes(n: number, random: () => number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) b[i] = Math.floor(random() * 256);
  return b;
}

const KiB = 1024;
const MiB = 1024 * KiB;

// ---------------------------------------------------------------- edits
export type Edit = { readonly name: string; apply(data: Uint8Array, random: () => number): Uint8Array };
const splice = (d: Uint8Array, at: number, remove: number, insert: Uint8Array) => {
  const out = new Uint8Array(d.length - remove + insert.length);
  out.set(d.subarray(0, at));
  out.set(insert, at);
  out.set(d.subarray(at + remove), at + insert.length);
  return out;
};
export const edits: Edit[] = [
  { name: "change 100 bytes in the middle", apply: (d, r) => { const o = d.slice(); o.set(randomBytes(100, r), d.length >> 1); return o; } },
  { name: "insert 100 bytes in the middle", apply: (d, r) => splice(d, d.length >> 1, 0, randomBytes(100, r)) },
  { name: "insert 100 bytes at the start", apply: (d, r) => splice(d, 0, 0, randomBytes(100, r)) },
  { name: "delete 1 KiB in the middle", apply: (d) => splice(d, d.length >> 1, KiB, new Uint8Array(0)) },
  { name: "append 1 MiB", apply: (d, r) => splice(d, d.length, 0, randomBytes(MiB, r)) },
];

// Bytes a client must upload after an edit: the chunks of the new version the server lacks.
export function newBytes(before: Uint8Array, after: Uint8Array, chunker: Chunker): { bytes: number; chunks: number } {
  const known = new Set(chunk(before, chunker).map((c) => c.hash));
  let bytes = 0;
  let chunks = 0;
  for (const c of chunk(after, chunker)) {
    if (known.has(c.hash)) continue;
    known.add(c.hash);
    bytes += c.length;
    chunks += 1;
  }
  return { bytes, chunks };
}

export const chunkers = (): Chunker[] => [new FixedChunker(4 * MiB), new FixedChunker(64 * KiB), new ContentDefinedChunker(64 * KiB)];

export function editTable(size = 32 * MiB, seed = 1) {
  const random = seeded(seed);
  const base = randomBytes(size, random);
  return edits.map((e) => {
    const after = e.apply(base, random);
    return { edit: e.name, results: chunkers().map((c) => ({ chunker: c.name, ...newBytes(base, after, c) })) };
  });
}

// ---------------------------------------------------------------- average chunk size
// For each target size: the bytes uploaded after one small edit at a random place (the mean of
// `trials` edits), and the number of chunks, so of hashes in the metadata, per GiB.
export function chunkSizeSweep(sizes: number[], size = 16 * MiB, trials = 12, seed = 2) {
  const random = seeded(seed);
  const base = randomBytes(size, random);
  return sizes.map((avg) => {
    const c = new ContentDefinedChunker(avg);
    const chunks = chunk(base, c);
    const known = new Set(chunks.map((x) => x.hash));
    let total = 0;
    for (let t = 0; t < trials; t += 1) {
      const at = Math.floor(random() * size);
      const after = splice(base, at, 0, randomBytes(100, random));
      for (const x of chunk(after, c)) if (!known.has(x.hash)) total += x.length;
    }
    return { average: avg, measuredAverage: Math.round(size / chunks.length), chunksPerGiB: Math.round((chunks.length * 1024 * MiB) / size), uploadPerEdit: Math.round(total / trials) };
  });
}

// ---------------------------------------------------------------- version history
// A file saved `versions` times, each save a small edit at a random place. How much does the
// block store hold, against keeping every version whole?
export function historyCost(size = 16 * MiB, versions = 20, seed = 3) {
  const random = seeded(seed);
  let data = randomBytes(size, random);
  const all = [data];
  for (let v = 1; v < versions; v += 1) {
    const at = Math.floor(random() * data.length);
    const kind = Math.floor(random() * 3);
    const n = 1 + Math.floor(random() * 1000);
    data = kind === 0 ? splice(data, at, 0, randomBytes(n, random)) : kind === 1 ? splice(data, at, Math.min(n, data.length - at), new Uint8Array(0)) : splice(data, at, Math.min(n, data.length - at), randomBytes(Math.min(n, data.length - at), random));
    all.push(data);
  }
  const whole = all.reduce((a, d) => a + d.length, 0);
  const rows = chunkers().map((c) => {
    const store = new Map<string, number>();
    for (const d of all) for (const x of chunk(d, c)) store.set(x.hash, x.length);
    let stored = 0;
    for (const n of store.values()) stored += n;
    return { chunker: c.name, stored };
  });
  return { versions, whole, rows };
}

// ---------------------------------------------------------------- a shared folder over a month
export type FolderOptions = {
  readonly devices: number;
  readonly files: number;
  readonly days: number;
  readonly editsPerHour: number; // per device
  readonly meanOnlineMinutes: number;
  readonly meanOfflineMinutes: number; // 0: always online
  readonly policy: Policy;
  readonly skewMinutes: number; // each device's clock is off by up to this much
  readonly seed: number;
};
// A file's content lists every edit it includes, so lost edits can be counted at the end.
const encode = (ids: Set<number>) => new TextEncoder().encode([...ids].sort((a, b) => a - b).join(","));
const decode = (b: Uint8Array | undefined) => new Set(b && b.length ? new TextDecoder().decode(b).split(",").map(Number) : []);

export function simulateFolder(o: FolderOptions) {
  const random = seeded(o.seed);
  const blocks = new BlockStore();
  const meta = new Namespace(blocks, o.policy);
  let now = 0;
  const devices = Array.from({ length: o.devices }, (_, i) => {
    const skew = (random() * 2 - 1) * o.skewMinutes;
    return new Device(`device ${i + 1}`, { meta, blocks }, new FixedChunker(4 * MiB), () => now + skew);
  });
  type Ev = { t: number; d: number; kind: "edit" | "toggle" };
  const end = o.days * 24 * 60;
  const exp = (mean: number) => -Math.log(1 - random()) * mean;
  const events: Ev[] = [];
  devices.forEach((_, d) => {
    for (let t = exp(60 / o.editsPerHour); t < end; t += exp(60 / o.editsPerHour)) events.push({ t, d, kind: "edit" });
    if (o.meanOfflineMinutes > 0) {
      let t = exp(o.meanOnlineMinutes);
      for (let on = true; t < end; on = !on) {
        events.push({ t, d, kind: "toggle" });
        t += exp(on ? o.meanOfflineMinutes : o.meanOnlineMinutes);
      }
    }
  });
  events.sort((a, b) => a.t - b.t);
  // file popularity: a few files take most of the edits
  const weights = Array.from({ length: o.files }, (_, i) => 1 / (i + 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let x = random() * sum;
    for (let i = 0; i < weights.length; i += 1) if ((x -= weights[i] as number) <= 0) return i;
    return weights.length - 1;
  };
  const online = devices.map(() => true);
  const broadcast = (from: number) => devices.forEach((dv, i) => { if (i !== from && online[i]) dv.pull(); });
  let editId = 0;
  for (const ev of events) {
    now = ev.t;
    const dv = devices[ev.d] as Device;
    if (ev.kind === "toggle") {
      online[ev.d] = !online[ev.d];
      if (online[ev.d]) {
        dv.pull();
        if (dv.push() > 0) broadcast(ev.d);
        dv.pull();
      }
      continue;
    }
    const path = `file${pick()}.txt`;
    const ids = decode(dv.read(path));
    ids.add((editId += 1));
    dv.write(path, encode(ids));
    if (online[ev.d] && dv.push() > 0) broadcast(ev.d);
    if (online[ev.d]) dv.pull();
  }
  // Everyone comes back online and syncs until nothing changes.
  now = end;
  for (let round = 0; round < 10; round += 1) {
    let moved = 0;
    for (const dv of devices) moved += dv.push() + dv.pull();
    if (moved === 0) break;
  }
  const survived = new Set<number>();
  for (const p of meta.paths()) for (const id of decode(devices[0]?.read(p))) survived.add(id);
  const agree = devices.every((dv) => dv.paths().join() === meta.paths().join() && meta.paths().every((p) => decode(dv.read(p)).size === decode(devices[0]?.read(p)).size));
  return {
    edits: editId,
    lost: editId - survived.size,
    conflictedCopies: meta.paths().filter((p) => p.includes("conflicted copy")).length,
    agree,
  };
}
