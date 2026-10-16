import assert from "node:assert/strict";
import { processorFor, registerProcessor, thumbnailBefore } from "./factory.ts";
import { cloudPlatform, localPlatform, startUploads } from "./platform.ts";
import { PhotoQueryBuilder, photoQuery } from "./query.ts";
import { getPool, getPoolRacy, Pool } from "./pool.ts";
import { Settings, settings } from "./singleton.ts";
import { deepCopy, EditPreset, shallowCopy, type Preset } from "./copy.ts";

// --- factory
const bytes = new Uint8Array(1200);
for (const type of ["image/jpeg", "image/png", "image/heic"]) assert.equal(processorFor(type).thumbnail(bytes, 200), thumbnailBefore(type, bytes));
assert.throws(() => processorFor("image/webp"), /cannot process image\/webp/);
registerProcessor("image/webp", () => ({ thumbnail: (b, w) => `webp thumbnail ${w}px from ${b.length} bytes` }));
console.log("factory:", processorFor("image/heic").thumbnail(bytes, 200), "|", processorFor("image/webp").thumbnail(bytes, 200));

// --- abstract factory
console.log("cloud:", startUploads(cloudPlatform)("p1.jpg", bytes));
console.log("local:", startUploads(localPlatform)("p1.jpg", bytes));
assert.equal(startUploads(cloudPlatform)("p1.jpg", bytes), "sqs thumbnails <- make thumbnail of s3://photos-prod/p1.jpg");
assert.equal(startUploads(localPlatform)("p1.jpg", bytes), "memory queue <- make thumbnail of file:./data/p1.jpg");

// --- builder
const d = (s: string) => new Date(s);
const built = new PhotoQueryBuilder("ana").takenBetween(d("2026-05-01"), d("2026-05-31")).tagged("lisbon").tagged("tram").oldestFirst().limit(20).build();
const viaOptions = photoQuery({ owner: "ana", from: d("2026-05-01"), to: d("2026-05-31"), tags: ["lisbon", "tram"], newestFirst: false, limit: 20 });
assert.deepEqual(built, viaOptions);
assert.deepEqual(new PhotoQueryBuilder("ben").build(), { owner: "ben", from: null, to: null, tags: [], newestFirst: true, limit: 50 });
assert.throws(() => new PhotoQueryBuilder("ana").takenBetween(d("2026-06-01"), d("2026-05-01")).build(), /start date is after/);
assert.throws(() => new PhotoQueryBuilder("ana").limit(5000).build(), /between 1 and 200/);
assert.throws(() => photoQuery({ owner: "ana", limit: 0 }), /between 1 and 200/);
assert.throws(() => { (built as { limit: number }).limit = 9; }, TypeError);
assert.throws(() => { (built.tags as string[]).push("x"); }, TypeError);
console.log("builder:", JSON.stringify(built), "| frozen:", Object.isFrozen(built));

// --- singleton: the race
const [a, b] = await Promise.all([getPoolRacy(), getPoolRacy()]);
console.log(`racy: two callers at once created ${Pool.created} pools; same object: ${a === b}`);
assert.equal(Pool.created, 2); assert.notEqual(a, b);
const before = Pool.created;
const [c, e] = await Promise.all([getPool(), getPool()]);
const f = await getPool();
console.log(`remembering the promise: created ${Pool.created - before} pool; same object: ${c === e && e === f}`);
assert.equal(Pool.created - before, 1); assert.equal(c, e); assert.equal(e, f);
assert.equal(Settings.get(), Settings.get()); assert.equal(Settings.get().maxUploadBytes, settings.maxUploadBytes);
// @ts-expect-error the constructor is private
const impossible = () => new Settings();
void impossible;

// --- prototype
const original: Preset = { name: "Portrait", crop: { width: 1080, height: 1350 }, filters: ["warm"] };
const s = shallowCopy(original, "Story"); s.crop.height = 1920; s.filters.push("grain");
console.log("after editing a shallow copy, the original is:", JSON.stringify(original));
assert.equal(original.crop.height, 1920); assert.deepEqual(original.filters, ["warm", "grain"]);
const original2: Preset = { name: "Portrait", crop: { width: 1080, height: 1350 }, filters: ["warm"] };
const dcopy = deepCopy(original2, "Story"); dcopy.crop.height = 1920; dcopy.filters.push("grain");
console.log("after editing a deep copy, the original is:   ", JSON.stringify(original2));
assert.equal(original2.crop.height, 1350); assert.deepEqual(original2.filters, ["warm"]);
const p = new EditPreset("Portrait", { width: 1080, height: 1350 }, ["warm"]);
const q = p.clone("Square"); q.narrowTo(800);
assert.equal(p.describe(), "Portrait: 1080x1350, warm"); assert.equal(q.describe(), "Square: 800x1350, warm");
const stripped = structuredClone(p) as unknown as Record<string, unknown>;
console.log("structuredClone of a class instance: describe is", typeof stripped.describe, "| is an EditPreset:", stripped instanceof EditPreset);
assert.equal(typeof stripped.describe, "undefined");
console.log("all assertions passed");
