import assert from "node:assert/strict";
import { BucketPhotoStore, type BucketClient } from "./adapter.ts";
import { Logging, Retrying, type Notifier } from "./decorator.ts";
import { GuardedReader, LazyImage } from "./proxy.ts";
import { PhotoIntake } from "./facade.ts";
import { Folder, PhotoItem } from "./composite.ts";
import { DigestNotice, email, push, ShareNotice } from "./bridge.ts";
import { cameraFor, distinctCameras } from "./flyweight.ts";

// --- adapter
const objects = new Map<string, Uint8Array>();
const vendor: BucketClient = {
  putObject: async ({ Bucket, Key, Body }) => { objects.set(`${Bucket}/${Key}`, Body); return { ETag: "abc" }; },
  getObject: async ({ Bucket, Key }) => { const b = objects.get(`${Bucket}/${Key}`); if (!b) { const e = new Error("The specified key does not exist."); e.name = "NoSuchKey"; throw e; } return { Body: b }; },
};
const store = new BucketPhotoStore(vendor, "photos-prod");
await store.save("p1", new Uint8Array([1, 2, 3]));
assert.deepEqual([...objects.keys()], ["photos-prod/photos/p1"]);
assert.equal((await store.load("p1"))?.length, 3); assert.equal(await store.load("nope"), null);
const broken: BucketClient = { ...vendor, getObject: async () => { throw new Error("connection reset"); } };
await assert.rejects(new BucketPhotoStore(broken, "b").load("p1"), /connection reset/);
console.log("adapter: saved under", [...objects.keys()][0], "| missing -> null | other errors pass through");

// --- decorator: the order of wrapping changes the behavior
const flaky = (failures: number) => { let calls = 0; const n: Notifier = { send: async () => { calls += 1; if (calls <= failures) throw new Error("mail server busy"); } }; return { n, calls: () => calls }; };
const a = flaky(2), logA: string[] = [];
await new Logging(new Retrying(a.n), (l) => logA.push(l)).send("ana@example.com", "hello");
const b = flaky(2), logB: string[] = [];
await new Retrying(new Logging(b.n, (l) => logB.push(l))).send("ana@example.com", "hello");
console.log("Logging(Retrying(x)): attempts", a.calls(), "log", JSON.stringify(logA));
console.log("Retrying(Logging(x)): attempts", b.calls(), "log", JSON.stringify(logB));
assert.deepEqual(logA, ["sending to ana@example.com", "sent"]); assert.equal(logB.length, 6); assert.equal(a.calls(), 3);
const c = flaky(5); await assert.rejects(new Retrying(c.n, 3).send("x", "y"), /busy/); assert.equal(c.calls(), 3);

// --- proxy
let loads = 0;
const images = Array.from({ length: 100 }, (_, i) => new LazyImage(`p${i}`, async () => { loads += 1; return new Uint8Array(4); }));
assert.equal(loads, 0);
const [x, y] = await Promise.all([images[7]!.pixels(), images[7]!.pixels()]); await images[7]!.pixels();
console.log("lazy: 100 images created, loads after asking one image three times:", loads, "| same bytes:", x === y);
assert.equal(loads, 1);
const reader = { load: async (id: string) => (id === "p1" || id === "p2" ? new Uint8Array(1) : null) };
const forBen = new GuardedReader(reader, "ben", (user, id) => user === "ana" || id === "p2");
assert.equal(await forBen.load("p1"), null); assert.notEqual(await forBen.load("p2"), null); assert.equal(await forBen.load("p9"), null);

// --- facade
const calls: string[] = [];
const intake = new PhotoIntake(
  { isSafe: (bytes) => { calls.push("scanner.isSafe"); return bytes.length < 10; } },
  { takenAt: () => { calls.push("metadata.takenAt"); return new Date("2026-05-02"); } },
  { make: (_b, w) => { calls.push(`thumbnails.make(${w})`); return new Uint8Array(2); } },
  { put: (key, bytes) => { calls.push(`files.put(${key}, ${bytes.length})`); } },
  { add: (id) => { calls.push(`index.add(${id})`); } },
);
intake.accept("p1", new Uint8Array(5));
console.log("facade: one call became", calls.length, "calls:", calls.join(", "));
assert.deepEqual(calls, ["scanner.isSafe", "metadata.takenAt", "files.put(original/p1, 5)", "thumbnails.make(200)", "files.put(thumb/p1, 2)", "index.add(p1)"]);
calls.length = 0; assert.throws(() => intake.accept("p2", new Uint8Array(50)), /safety scan/); assert.deepEqual(calls, ["scanner.isSafe"]);

// --- composite
const lisbon = new Folder("Lisbon").add(new PhotoItem("tram.jpg", 4e6)).add(new PhotoItem("castle.jpg", 5e6)).add(new PhotoItem("river.jpg", 3e6));
const rome = new Folder("Rome").add(new PhotoItem("forum.jpg", 6e6)).add(new PhotoItem("cat.jpg", 2e6));
const trips = new Folder("Trips").add(lisbon).add(rome).add(new PhotoItem("map.png", 1e6));
console.log(`composite: ${trips.name} holds ${trips.photoCount()} photos, ${trips.bytes() / 1e6} MB; Lisbon ${lisbon.photoCount()}, ${lisbon.bytes() / 1e6} MB; Rome ${rome.photoCount()}, ${rome.bytes() / 1e6} MB`);
assert.equal(trips.photoCount(), 6); assert.equal(trips.bytes(), 21e6); assert.equal(new Folder("empty").bytes(), 0);
assert.throws(() => lisbon.add(trips), /cannot contain itself/); assert.throws(() => trips.add(trips), /cannot contain itself/);

// --- bridge: two kinds of notice, two channels, every pairing works
for (const ch of [email, push]) console.log("bridge:", new ShareNotice(ch, "Chi", "Lisbon").send("ana"), "|", new DigestNotice(ch, 12).send("ana"));
assert.equal(new ShareNotice(push, "Chi", "Lisbon").send("ana"), "push to ana: New shared album: Chi shared the album Lisbon wi");

// --- flyweight
const c1 = cameraFor("Maker", "X1", "24-70mm", "full frame"), c2 = cameraFor("Maker", "X1", "24-70mm", "full frame"), c3 = cameraFor("Maker", "X2", "24-70mm", "full frame");
assert.equal(c1, c2); assert.notEqual(c1, c3); assert.equal(distinctCameras(), 2);
assert.throws(() => { (c1 as { model: string }).model = "changed"; }, TypeError);
console.log("flyweight: same camera asked for twice is one object:", c1 === c2, "| distinct:", distinctCameras());
console.log("all assertions passed");
