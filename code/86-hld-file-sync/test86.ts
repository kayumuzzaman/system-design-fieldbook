import assert from "node:assert/strict";
import { chunk, ContentDefinedChunker, FixedChunker, sha256 } from "./chunking.ts";
import { BlockStore } from "./blocks.ts";
import { Namespace } from "./metadata.ts";
import { Device } from "./device.ts";
import { chunkSizeSweep, editTable, historyCost, randomBytes, seeded, simulateFolder } from "./experiments.ts";

const KiB = 1024;
const MiB = 1024 * KiB;
const kib = (n: number) => `${(n / KiB).toFixed(n < 10 * KiB ? 1 : 0)} KiB`;
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

// --- chunking: chunks rebuild the file, boundaries are repeatable, sizes stay within bounds
{
  const data = randomBytes(8 * MiB, seeded(7));
  for (const c of [new FixedChunker(4 * MiB), new FixedChunker(64 * KiB), new ContentDefinedChunker(64 * KiB)]) {
    const chunks = chunk(data, c);
    assert.deepEqual(join(chunks.map((x) => data.subarray(x.offset, x.offset + x.length))), data);
    assert.deepEqual(chunk(data, c), chunks); // the same bytes always give the same chunks
  }
  const cdc = chunk(data, new ContentDefinedChunker(64 * KiB));
  cdc.slice(0, -1).forEach((x) => assert.ok(x.length >= 16 * KiB && x.length <= 256 * KiB));
  assert.deepEqual(new FixedChunker(4).ends(new Uint8Array(10)), [4, 8, 10]);
  assert.deepEqual(new FixedChunker(4).ends(new Uint8Array(0)), []);
}

// --- what one edit costs to upload, on a 32 MiB file
{
  const table = editTable();
  console.log("bytes to upload after one edit to a 32 MiB file (new chunks):");
  for (const row of table) console.log(`  ${row.edit.padEnd(32)} ${row.results.map((r) => `${r.chunker}: ${kib(r.bytes)} in ${r.chunks}`).join(" | ")}`);
  const get = (edit: string, chunker: string) => table.find((r) => r.edit.startsWith(edit))?.results.find((r) => r.chunker.startsWith(chunker))?.bytes ?? NaN;
  assert.ok(get("insert 100 bytes at the start", "fixed 4194304") > 32 * MiB); // every fixed chunk shifted
  assert.ok(get("insert 100 bytes at the start", "fixed 65536") > 32 * MiB);
  assert.ok(get("insert 100 bytes at the start", "content") < 256 * KiB); // content-defined: one or two chunks
  assert.ok(get("insert 100 bytes in the middle", "content") < 512 * KiB);
  assert.ok(get("change 100 bytes", "fixed 65536") <= 128 * KiB);
}

// --- the average chunk size: upload per small edit against metadata per GiB
{
  const sweep = chunkSizeSweep([4 * KiB, 16 * KiB, 64 * KiB, 256 * KiB, 1 * MiB, 4 * MiB]);
  console.log("content-defined chunks, by target average: measured average, chunks per GiB, upload after inserting 100 bytes at a random place (mean of 12)");
  for (const s of sweep) console.log(`  ${kib(s.average).padStart(9)}: average ${kib(s.measuredAverage)}, ${s.chunksPerGiB.toLocaleString("en-US")} chunks per GiB, ${kib(s.uploadPerEdit)} per edit`);
  for (let i = 1; i < sweep.length; i += 1) assert.ok((sweep[i]?.chunksPerGiB ?? 0) < (sweep[i - 1]?.chunksPerGiB ?? 0));
}

// --- version history: twenty saves of a 16 MiB file, each a small edit
{
  const h = historyCost();
  console.log(`${h.versions} versions of a 16 MiB file, each a small edit: ${(h.whole / MiB).toFixed(1)} MiB if every version is kept whole`);
  for (const r of h.rows) console.log(`  ${r.chunker.padEnd(24)} stores ${(r.stored / MiB).toFixed(1)} MiB (${((r.stored / h.whole) * 100).toFixed(1)}% of that)`);
  const cdc = h.rows.find((r) => r.chunker.startsWith("content"))?.stored ?? NaN;
  assert.ok(cdc < 1.2 * 16 * MiB);
}

// --- the block store checks every block against its name
{
  const store = new BlockStore();
  const b = new TextEncoder().encode("hello");
  assert.throws(() => store.put(sha256(new TextEncoder().encode("other")), b), /does not match/);
  store.put(sha256(b), b);
  assert.deepEqual(store.missing([sha256(b), "ab"]), ["ab"]);
}

// --- the protocol: upload only what is missing, download only what is new
{
  const blocks = new BlockStore();
  const meta = new Namespace(blocks);
  const server = { meta, blocks };
  const cdc = new ContentDefinedChunker(64 * KiB);
  const laptop = new Device("laptop", server, cdc, () => 1);
  const phone = new Device("phone", server, cdc, () => 2);
  const file = randomBytes(4 * MiB, seeded(11));
  laptop.write("report.pdf", file);
  assert.equal(laptop.push(), 1);
  assert.equal(laptop.uploaded, file.length); // first upload: every block is new
  assert.equal(phone.pull(), 1);
  assert.deepEqual(phone.read("report.pdf"), file);
  assert.equal(phone.downloaded, file.length);
  // the phone inserts a sentence near the start
  const edited = join([file.subarray(0, 1000), new TextEncoder().encode("A new sentence."), file.subarray(1000)]);
  phone.write("report.pdf", edited);
  phone.push();
  laptop.pull();
  assert.deepEqual(laptop.read("report.pdf"), edited);
  console.log(`a 4 MiB file with 15 bytes inserted: the phone uploaded ${kib(phone.uploaded)}, the laptop downloaded ${kib(laptop.downloaded)}`);
  assert.ok(phone.uploaded < 300 * KiB && laptop.downloaded < 300 * KiB);
  // another user's copy of the same file: nothing to upload
  const other = new Namespace(blocks);
  const ana = new Device("ana", { meta: other, blocks }, cdc, () => 3);
  ana.write("same.pdf", file);
  ana.push();
  assert.equal(ana.uploaded, 0);
  console.log(`the same 4 MiB file saved by another user: ${ana.uploaded} bytes uploaded`);
  // garbage collection: drop the first version, and only its unshared blocks go
  const v1 = chunk(file, cdc).map((c) => c.hash);
  blocks.releaseRefs(v1); // version 1 of report.pdf leaves the history
  assert.equal(blocks.collect(), 0); // ana's copy still refers to every block
  blocks.releaseRefs(v1); // and ana deletes hers
  const freed = blocks.collect();
  assert.ok(freed > 0 && freed < 300 * KiB); // only the chunk the edit replaced: the rest are in version 2
}

// --- a conflict: two devices edit the same version while offline
{
  const blocks = new BlockStore();
  const meta = new Namespace(blocks);
  const server = { meta, blocks };
  const fixed = new FixedChunker(4 * MiB);
  const laptop = new Device("Laptop", server, fixed, () => 1);
  const phone = new Device("Phone", server, fixed, () => 2);
  const text = (s: string) => new TextEncoder().encode(s);
  laptop.write("notes.txt", text("v1"));
  laptop.push();
  phone.pull();
  laptop.write("notes.txt", text("laptop's edit"));
  phone.write("notes.txt", text("phone's edit"));
  assert.equal(laptop.push(), 1); // first to reach the server wins the name
  assert.equal(phone.push(), 1); // the phone's commit conflicts; its copy is committed under a new name
  laptop.pull();
  phone.pull();
  const expect = ["notes (Phone’s conflicted copy).txt", "notes.txt"];
  assert.deepEqual(meta.paths(), expect);
  assert.deepEqual(laptop.paths(), expect);
  assert.deepEqual(phone.paths(), expect);
  assert.equal(new TextDecoder().decode(phone.read("notes.txt")), "laptop's edit");
  assert.equal(new TextDecoder().decode(laptop.read(expect[0] as string)), "phone's edit");
  assert.equal(phone.conflicts, 1);
}

// --- the journal is read a page at a time without missing or repeating anything
{
  const blocks = new BlockStore();
  const meta = new Namespace(blocks);
  const d = new Device("d", { meta, blocks }, new FixedChunker(4 * MiB), () => 0);
  for (let i = 0; i < 250; i += 1) d.write(`f${i}`, new Uint8Array([i % 256]));
  d.push();
  const seen: number[] = [];
  let cursor = 0;
  for (let page = meta.changes(cursor); ; page = meta.changes(cursor)) {
    seen.push(...page.versions.map((v) => v.rev));
    cursor = page.cursor;
    if (!page.hasMore) break;
  }
  assert.deepEqual(seen, Array.from({ length: 250 }, (_, i) => i + 1));
}

// --- a shared folder for 30 days: conflicts against lost edits
{
  console.log("4 devices, 40 files, 30 days, 1 edit per device per hour; online for 4 hours on average between offline spells:");
  for (const off of [0, 10, 60, 240]) {
    const base = { devices: 4, files: 40, days: 30, editsPerHour: 1, meanOnlineMinutes: 240, meanOfflineMinutes: off, skewMinutes: 2, seed: 5 };
    const rev = simulateFolder({ ...base, policy: "revision" });
    const lww = simulateFolder({ ...base, policy: "last-write-wins" });
    assert.ok(rev.agree && lww.agree); // every device ends with the server's files
    assert.equal(rev.lost, 0); // the revision check never loses an edit
    if (off === 0) assert.equal(rev.conflictedCopies, 0); // always online: nothing is concurrent
    assert.ok(lww.lost > 0); // even then, clocks up to 2 minutes apart drop some saves
    console.log(`  offline spells of ${String(off).padStart(3)} min: ${rev.edits} edits; revision check: ${rev.conflictedCopies} conflicted copies, ${rev.lost} lost; last write wins: ${lww.lost} edits lost`);
  }
}
{
  // the same month, always online, with perfect clocks: last write wins loses nothing
  const exact = simulateFolder({ devices: 4, files: 40, days: 30, editsPerHour: 1, meanOnlineMinutes: 240, meanOfflineMinutes: 0, skewMinutes: 0, seed: 5, policy: "last-write-wins" });
  assert.equal(exact.lost, 0);
  console.log(`  always online with clocks that agree exactly: last write wins lost ${exact.lost} of ${exact.edits}`);
}
console.log("all chapter 86 tests passed");
