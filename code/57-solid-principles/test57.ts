import assert from "node:assert/strict";
import { ReportMailer, UsageReportBefore, usageAsHtml, usageOf } from "./srp.ts";
import { albumLimitBefore, family, free, monthlyPriceBefore, Plans, plus, pro } from "./ocp.ts";
import { copyAll, copyAllSafely, MemoryStore, Snapshot, SnapshotStore } from "./lsp.ts";
import { ImageTools, thumbnail, thumbnailBefore, type MediaTools } from "./isp.ts";
import { buildShareAlbum, ShareAlbum, ShareAlbumBefore } from "./dip.ts";
import { Album, canUploadBefore, Owner, Plan } from "./demeter.ts";

// --- single responsibility
const photos = [{ bytes: 1.5e9, deleted: false }, { bytes: 0.2e9, deleted: false }, { bytes: 9e9, deleted: true }];
const sentA: string[] = [], sentB: string[] = [];
new UsageReportBefore(photos, (to, html) => sentA.push(`${to}|${html}`)).email("ana@example.com");
new ReportMailer((to, html) => sentB.push(`${to}|${html}`)).deliver("ana@example.com", usageAsHtml(usageOf(photos)));
assert.deepEqual(sentA, sentB);
assert.deepEqual(usageOf(photos), { photos: 2, gigabytes: 2 });
console.log("srp: same output before and after:", sentB[0]);

// --- open/closed
const plans = new Plans([free, plus, family]);
for (const name of ["free", "plus", "family"] as const) {
  for (const gb of [0, 50, 100, 250, 800]) assert.equal(plans.named(name).monthlyPrice(gb), monthlyPriceBefore(name, gb));
  assert.equal(plans.named(name).albumLimit, albumLimitBefore(name));
}
const withPro = new Plans([free, plus, family, pro]);
console.log("ocp: plus at 250 GB:", plans.named("plus").monthlyPrice(250), "cents; pro at 3,500 GB:", withPro.named("pro").monthlyPrice(3500), "cents; pro albums:", withPro.named("pro").albumLimit);
assert.equal(withPro.named("pro").monthlyPrice(3500), 3000);
assert.throws(() => plans.named("pro"), /no plan called pro/);

// --- Liskov substitution
const live = new MemoryStore();
await live.save("p1", new Uint8Array([1])); await live.save("p2", new Uint8Array([2]));
assert.equal(await copyAll(live, new MemoryStore(), ["p1", "p2", "p3"]), 2);
await assert.rejects(copyAll(live, new SnapshotStore(live), ["p1", "p2"]), /snapshot cannot be changed/);
console.log("lsp: copyAll into a SnapshotStore compiles, then fails at run time");
assert.equal(await copyAllSafely(new Snapshot(live), new MemoryStore(), ["p1", "p2"]), 2);
// @ts-expect-error a Snapshot has no save, so it is not a PhotoWriter: the mistake is caught before the program runs
const impossible = () => copyAllSafely(live, new Snapshot(live), ["p1"]);
void impossible;
console.log("lsp: with PhotoReader and PhotoWriter the same mistake is a compile error");

// --- interface segregation
const fakeAll: MediaTools = {
  resize: (_image, width) => ({ width, height: 1 }),
  detectFaces: () => { throw new Error("not needed"); },
  readText: () => { throw new Error("not needed"); },
  transcodeVideo: () => { throw new Error("not needed"); },
};
assert.equal(thumbnailBefore(fakeAll, { width: 4000, height: 3000 }).width, 200);
assert.equal(thumbnail({ resize: (_image, width) => ({ width, height: 1 }) }, { width: 4000, height: 3000 }).width, 200);
assert.deepEqual(thumbnail(new ImageTools(), { width: 4000, height: 3000 }), { width: 200, height: 150 });
console.log("isp: the fake for the wide interface needs 4 methods, the fake for Resizer needs 1");

// --- dependency inversion
assert.throws(() => new ShareAlbumBefore().run("a1", "ana", "ben"), /no database is reachable/);
const stored = new Map([["a1", { id: "a1", owner: "ana", sharedWith: [] as string[] }]]);
const mail: string[] = [];
const share = new ShareAlbum({ find: (id) => stored.get(id)!, save: (a) => void stored.set(a.id, a) }, { send: (to, text) => void mail.push(`${to}: ${text}`) });
share.run("a1", "ana", "ben"); share.run("a1", "ana", "ben");
assert.deepEqual(stored.get("a1")!.sharedWith, ["ben"]);
assert.throws(() => share.run("a1", "chi", "ben"), /only the owner/);
assert.throws(() => buildShareAlbum().run("a1", "ana", "ben"), /no database is reachable/);
console.log("dip: ShareAlbumBefore cannot run without a database; ShareAlbum ran with two small fakes:", mail[0]);

// --- Law of Demeter
const record = { owner: { active: true, plan: { maxPhotoBytes: 20e6 } }, photoCount: 3 };
const album = new Album(new Owner(true, new Plan(20e6)));
for (const bytes of [1e6, 20e6, 21e6]) assert.equal(album.canAccept(bytes), canUploadBefore(record, bytes));
assert.equal(new Album(new Owner(false, new Plan(20e6))).canAccept(1), false);
console.log("demeter: same answers; the caller now knows one class instead of three");
console.log("all assertions passed");
