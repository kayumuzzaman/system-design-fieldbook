import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { exponential, fixed, FixedBackoff, jittered, Uploader } from "./strategy.ts";
import { Album } from "./observer.ts";
import { Upload as TableUpload, type UploadEvent } from "./table.ts";
import { Upload as StateUpload } from "./state.ts";
import { AddFilter, Crop, History, Rotate, type Picture } from "./command.ts";
import { chain, limited, logged, signedIn, type Handler } from "./chain.ts";
import { Importer, importFrom, type Reader } from "./template.ts";
import { allPhotos, Shelf, type FetchPage } from "./iterator.ts";

// --- strategy: the same Uploader, three ways of waiting
const failing = (times: number) => { let n = 0; return async () => { n += 1; if (n <= times) throw new Error("network"); }; };
const waitsWith = async (backoff: (attempt: number) => number) => {
  const waits: number[] = [];
  const attempts = await new Uploader(backoff, async (ms) => { waits.push(ms); }).upload(failing(3));
  return { attempts, waits };
};
const f = await waitsWith(fixed(200)), e = await waitsWith(exponential(100, 5000)), j = await waitsWith(jittered(exponential(100, 5000), () => 0.5));
assert.deepEqual(f, { attempts: 4, waits: [200, 200, 200] });
assert.deepEqual(e, { attempts: 4, waits: [100, 200, 400] });
assert.deepEqual(j.waits, [50, 100, 200]);
assert.equal(exponential(100, 5000)(10), 5000);
const policy = new FixedBackoff(200);
assert.deepEqual((await waitsWith((attempt) => policy.delay())).waits, [200, 200, 200]);
await assert.rejects(new Uploader(fixed(1), async () => {}).upload(failing(9)), /network/);
console.log("strategy: fixed", f.waits, "exponential", e.waits, "half jitter", j.waits, "| attempts", f.attempts);

// --- observer
const album = new Album("Lisbon");
const told: string[] = [];
album.events.on("photoAdded", ({ photo }) => told.push(`feed:${photo}`));
const stopIndex = album.events.on("photoAdded", ({ photo }) => told.push(`index:${photo}`));
album.events.on("photoAdded", () => { throw new Error("push service down"); });
album.events.on("photoAdded", ({ photo }) => told.push(`backup:${photo}`));
album.add("p1");
assert.deepEqual(told, ["feed:p1", "index:p1", "backup:p1"]);
stopIndex();
album.add("p2");
assert.deepEqual(told.slice(3), ["feed:p2", "backup:p2"]);
assert.equal(album.events.count("photoAdded"), 3);
const errors = album.events.emit("photoAdded", { album: "Lisbon", photo: "p3" });
assert.equal(errors.length, 1);
// Node's own EventEmitter: a listener that throws stops the ones after it, and the error reaches the emitter.
const node = new EventEmitter(); const nodeTold: string[] = [];
node.on("photoAdded", () => nodeTold.push("first")); node.on("photoAdded", () => { throw new Error("push service down"); }); node.on("photoAdded", () => nodeTold.push("third"));
assert.throws(() => node.emit("photoAdded"), /push service down/);
assert.deepEqual(nodeTold, ["first"]);
console.log("observer: told", told.slice(0, 3), "| after unsubscribe", told.slice(3, 5), "| errors collected", errors.length, "| node:events told", nodeTold, "then threw");

// --- state: the state objects and the table from chapter 58 must agree on every sequence of up to 5 events
const events: UploadEvent[] = ["start", "received", "processed", "error", "retry", "cancel"];
const outcome = (make: () => { handle(e: UploadEvent): void; state: string; attempts: number }, script: UploadEvent[]) => {
  const upload = make(); const trace: string[] = [];
  for (const event of script) { try { upload.handle(event); trace.push(`${upload.state}/${upload.attempts}`); } catch (error) { trace.push((error as Error).message); } }
  return trace.join(" > ");
};
let scripts: UploadEvent[][] = [[]], compared = 0;
for (let length = 1; length <= 5; length += 1) {
  scripts = scripts.flatMap((s) => events.map((event) => [...s, event]));
  for (const script of scripts) { assert.equal(outcome(() => new StateUpload("u"), script), outcome(() => new TableUpload("u"), script)); compared += 1; }
}
const story: UploadEvent[] = ["start", "error", "retry", "error", "retry", "error", "retry"];
console.log("state:", compared, "event sequences compared, all equal |", outcome(() => new StateUpload("u"), story));

// --- command
const picture: Picture = { width: 4000, height: 3000, rotation: 0, filters: [] };
const history = new History();
const show = () => `${picture.width}x${picture.height} rot ${picture.rotation} [${picture.filters}]`;
history.run(new Crop(picture, 3000, 3000)); history.run(new Rotate(picture, 90)); history.run(new AddFilter(picture, "warm"));
assert.equal(show(), "3000x3000 rot 90 [warm]");
history.undo(); history.undo();
assert.equal(show(), "3000x3000 rot 0 []"); assert.deepEqual(history.redoable, ["filter warm", "rotate 90"]);
history.redo();
assert.equal(show(), "3000x3000 rot 90 []");
history.run(new AddFilter(picture, "grain"));
assert.deepEqual(history.redoable, []); assert.equal(history.redo(), false);
assert.deepEqual(history.labels, ["crop to 3000x3000", "rotate 90", "filter grain"]);
while (history.undo());
assert.equal(show(), "4000x3000 rot 0 []");
console.log("command: after three edits, two undos, one redo and a new edit:", history.labels.length ? "" : "all undone ->", show());

// --- chain of responsibility
const log: string[] = []; let reached = 0;
const photos: Handler = async () => { reached += 1; return { status: 200, body: "photos" }; };
const app = chain([logged((line) => log.push(line)), signedIn, limited(2)], photos);
const statuses = [await app({ path: "/photos" }), await app({ path: "/photos", user: "ana" }), await app({ path: "/photos", user: "ana" }), await app({ path: "/photos", user: "ana" }), await app({ path: "/photos", user: "ben" })].map((r) => r.status);
assert.deepEqual(statuses, [401, 200, 200, 429, 200]); assert.equal(reached, 3); assert.equal(log.length, 5);
// the same links in the wrong order: anonymous requests are counted together and lock each other out
const wrong = chain([limited(2), signedIn], photos);
const anonymous = [await wrong({ path: "/photos" }), await wrong({ path: "/photos" }), await wrong({ path: "/photos" })].map((r) => r.status);
assert.deepEqual(anonymous, [401, 401, 429]);
console.log("chain: statuses", statuses, "| handler reached", reached, "times | log", log);

// --- template method
const folder: Record<string, number> = { "a.jpg": 3, "notes.txt": 1, "b.HEIC": 4, "c.png": 2, "clip.mov": 9 };
const saved: string[] = []; const save = async (name: string) => { saved.push(name); };
class FolderImporter extends Importer {
  protected async list(): Promise<string[]> { return Object.keys(folder); }
  protected async read(_: string, name: string): Promise<Uint8Array> { return new Uint8Array(folder[name] ?? 0); }
}
class RawImporter extends FolderImporter { protected override accepts(name: string): boolean { return name.endsWith(".mov") || super.accepts(name); } }
const viaClass = await new FolderImporter(save).run("/trip");
const reader: Reader = { list: async () => Object.keys(folder), read: async (_, name) => new Uint8Array(folder[name] ?? 0) };
const viaFunction = await importFrom(reader, "/trip", save);
assert.deepEqual(viaClass, viaFunction); assert.deepEqual(viaClass, { imported: ["a.jpg", "b.HEIC", "c.png"], skipped: ["notes.txt", "clip.mov"] });
assert.deepEqual((await new RawImporter(save).run("/trip")).skipped, ["notes.txt"]);
console.log("template: imported", viaClass.imported, "skipped", viaClass.skipped, "| function form equal: true");

// --- iterator
const shelf = new Shelf(); shelf.add(2026, "tram"); shelf.add(2024, "forum"); shelf.add(2026, "castle");
assert.deepEqual([...shelf], ["forum", "tram", "castle"]);
let fetched = 0;
const fetchPage: FetchPage = async (cursor) => { fetched += 1; const page = Number(cursor ?? 0); return { photos: Array.from({ length: 100 }, (_, i) => `p${page * 100 + i}`), next: page < 4 ? String(page + 1) : null }; };
let seen = 0;
for await (const photo of allPhotos(fetchPage)) { seen += 1; if (photo === "p150") break; }
const pagesForEarlyExit = fetched; fetched = 0; let total = 0;
for await (const _ of allPhotos(fetchPage)) total += 1;
assert.equal(pagesForEarlyExit, 2); assert.equal(seen, 151); assert.equal(total, 500); assert.equal(fetched, 5);
console.log("iterator: shelf", [...shelf], "| stopped at p150 after", seen, "photos and", pagesForEarlyExit, "pages | all", total, "photos in", fetched, "pages");
console.log("all assertions passed");
