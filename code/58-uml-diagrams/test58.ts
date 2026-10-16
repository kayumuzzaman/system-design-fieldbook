import assert from "node:assert/strict";
import { Upload, type UploadEvent, type UploadState } from "./upload.ts";
import { Album, Rejected, Uploader } from "./uploader.ts";

// --- the state machine: the run drawn in the figure
const u = new Upload("u1");
const seen: string[] = [`${u.state}/${u.attempts}`];
for (const e of ["start", "error", "retry", "received", "processed"] as UploadEvent[]) { u.handle(e); seen.push(`${e}->${u.state}/${u.attempts}`); }
console.log("run:", seen.join("  "));
assert.equal(u.state, "ready"); assert.equal(u.attempts, 2);
assert.throws(() => u.handle("cancel"), /ready cannot cancel/);
assert.throws(() => new Upload("x").handle("processed"), /pending cannot processed/);
// the guard: three attempts, then no more
const v = new Upload("u2"); v.handle("start");
v.handle("error"); v.handle("retry"); v.handle("error"); v.handle("retry"); v.handle("error");
assert.equal(v.attempts, 3);
assert.throws(() => v.handle("retry"), /no attempts left/);
v.handle("cancel"); assert.equal(v.state, "canceled");
// every state and event: build the table printed in the chapter
const states: UploadState[] = ["pending", "uploading", "processing", "failed", "ready", "canceled"];
const events: UploadEvent[] = ["start", "received", "processed", "error", "retry", "cancel"];
const reach = (s: UploadState): Upload => { const x = new Upload("t"); const path: Record<UploadState, UploadEvent[]> = { pending: [], uploading: ["start"], processing: ["start", "received"], failed: ["start", "error"], ready: ["start", "received", "processed"], canceled: ["cancel"] }; for (const e of path[s]) x.handle(e); return x; };
let legal = 0;
for (const s of states) {
  const row = events.map((e) => { const x = reach(s); try { x.handle(e); legal += 1; return x.state; } catch { return "-"; } });
  console.log(s.padEnd(11), row.map((c) => c.padEnd(11)).join(""));
}
console.log("legal transitions:", legal, "of", states.length * events.length);
assert.equal(legal, 9);

// --- the uploader: the order of calls is the sequence diagram
const calls: string[] = [];
const album = new Album("lisbon");
let n = 0;
const make = (reason: string | null) => new Uploader(
  { check: (f) => { calls.push(`Validator.check(${f.name})`); return reason; } },
  { find: async (id) => { calls.push(`Albums.find(${id})`); return album; }, save: async (a) => { calls.push(`Albums.save(${a.id})`); } },
  { save: async (id, bytes) => { calls.push(`PhotoStore.save(${id}, ${bytes.length} bytes)`); } },
  { photoAdded: (a, p) => { calls.push(`Notifier.photoAdded(${a.id}, ${p.id})`); } },
  () => `p${++n}`,
);
const photo = await make(null).upload("lisbon", { name: "tram.jpg", bytes: new Uint8Array(3) });
assert.deepEqual(calls, ["Validator.check(tram.jpg)", "Albums.find(lisbon)", "PhotoStore.save(p1, 3 bytes)", "Albums.save(lisbon)", "Notifier.photoAdded(lisbon, p1)"]);
assert.deepEqual(photo, { id: "p1", name: "tram.jpg", size: 3 }); assert.equal(album.count, 1);
console.log("accepted file, calls in order:\n  " + calls.join("\n  "));
calls.length = 0;
await assert.rejects(make("not an image").upload("lisbon", { name: "notes.txt", bytes: new Uint8Array(1) }), Rejected);
assert.deepEqual(calls, ["Validator.check(notes.txt)"]); assert.equal(album.count, 1);
console.log("rejected file, calls:", calls.join(", "));
console.log("all assertions passed");
