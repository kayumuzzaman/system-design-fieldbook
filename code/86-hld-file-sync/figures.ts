// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { chunk, ContentDefinedChunker, FixedChunker } from "./chunking.ts";
import { chunkSizeSweep, editTable, historyCost, randomBytes, seeded, simulateFolder } from "./experiments.ts";

const KiB = 1024;
// fig-boundaries: the first 1.5 MiB of a file, before and after inserting 100 bytes at 200 KiB
const random = seeded(4);
const before = randomBytes(2048 * KiB, random);
const at = 200 * KiB;
const after = new Uint8Array(before.length + 100);
after.set(before.subarray(0, at));
after.set(randomBytes(100, random), at);
after.set(before.subarray(at), at + 100);
const boundaries = [new FixedChunker(64 * KiB), new ContentDefinedChunker(64 * KiB)].map((c) => {
  const old = chunk(before, c);
  const known = new Set(old.map((x) => x.hash));
  return {
    chunker: c.name,
    before: old.map((x) => [x.offset, x.length]),
    after: chunk(after, c).map((x) => [x.offset, x.length, known.has(x.hash) ? 0 : 1]),
  };
});
const sweep = chunkSizeSweep([4 * KiB, 16 * KiB, 64 * KiB, 256 * KiB, 1024 * KiB]);
const folder = [0, 10, 60, 240].map((off) => {
  const base = { devices: 4, files: 40, days: 30, editsPerHour: 1, meanOnlineMinutes: 240, meanOfflineMinutes: off, skewMinutes: 2, seed: 5 };
  return { off, revision: simulateFolder({ ...base, policy: "revision" }), lww: simulateFolder({ ...base, policy: "last-write-wins" }) };
});
// fig-sync: the test's 4 MiB file with 15 bytes inserted near the start
const file = randomBytes(4096 * KiB, seeded(11));
const edited = new Uint8Array(file.length + 15);
edited.set(file.subarray(0, 1000));
edited.set(new TextEncoder().encode("A new sentence."), 1000);
edited.set(file.subarray(1000), 1015);
const cdc = new ContentDefinedChunker(64 * KiB);
const known = new Set(chunk(file, cdc).map((c) => c.hash));
const editedChunks = chunk(edited, cdc);
const fresh = editedChunks.filter((c) => !known.has(c.hash));
const protocol = { chunks: editedChunks.length, newChunks: fresh.length, newBytes: fresh.reduce((a, c) => a + c.length, 0) };
console.log(JSON.stringify({ protocol, insertAt: at, boundaries, edits: editTable(), sweep, history: historyCost(), folder }));
