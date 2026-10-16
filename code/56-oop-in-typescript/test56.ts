import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Album, OpenAlbum } from "./album.ts";
import { Library, MemoryStore, type PhotoStore } from "./store.ts";
import { DiskStore } from "./disk.ts";
import { EmailNotifier, NotificationCenter, notifyBefore, PushNotifier, type User } from "./notify.ts";
import { describe } from "./events.ts";
import { Bag, CountedBag, CountingBag } from "./bag.ts";

// --- encapsulation
const open = new OpenAlbum();
open.photos.push({ id: "p1", bytes: 10 }); open.coverId = "p1";
open.photos.length = 0; // a caller empties the album and forgets the cover
console.log("open album: photos", open.photos.length, "cover", open.coverId, "(cover points at nothing)");
const album = new Album(3);
const coverId = () => album.cover?.id ?? null;
assert.equal(coverId(), null);
album.add({ id: "p1", bytes: 10 }); album.add({ id: "p2", bytes: 20 });
assert.equal(coverId(), "p1");
album.remove("p1"); assert.equal(coverId(), "p2");
album.remove("p2"); assert.equal(coverId(), null); assert.equal(album.size, 0);
album.add({ id: "p3", bytes: 1 }); album.add({ id: "p4", bytes: 1 }); album.add({ id: "p5", bytes: 1 });
assert.throws(() => album.add({ id: "p6", bytes: 1 }), /at most 3/);
assert.throws(() => album.setCover("nope"), /must be a photo/);
const copy = album.list() as { id: string; bytes: number }[]; copy.length = 0;
assert.equal(album.size, 3);
console.log("album: rules held through add, remove, setCover; list() is a copy");
// private is a compile-time promise
class WithPrivate { private secret = 1; #hidden = 2; reveal(): number { return this.secret + this.#hidden; } }
const w = new WithPrivate();
console.log("private keyword at run time:", (w as unknown as Record<string, unknown>).secret, "| keys:", Object.keys(w), "| JSON:", JSON.stringify(w), "| reveal:", w.reveal());

// --- abstraction
const dir = await mkdtemp(join(tmpdir(), "photos-"));
const literal: PhotoStore = { save: async () => {}, load: async () => new Uint8Array([9]), delete: async () => {} }; // no class, no "implements"
for (const [name, store] of [["memory", new MemoryStore()], ["disk", new DiskStore(dir)], ["object literal", literal]] as const) {
  const library = new Library(store, 4);
  await library.upload("p1", new Uint8Array([1, 2, 3]));
  const back = await library.download("p1");
  await assert.rejects(library.upload("p2", new Uint8Array(5)), /too large/);
  await assert.rejects(library.upload("p3", new Uint8Array(0)), /empty/);
  console.log(`library on ${name} store: got back ${back.length} byte(s)`);
}
await assert.rejects(new Library(new MemoryStore()).download("missing"), /no photo/);
await rm(dir, { recursive: true });

// --- polymorphism
const ana: User = { name: "Ana", email: "ana@example.com", deviceToken: "dev-1" };
const ben: User = { name: "Ben", email: "ben@example.com" };
const a: string[] = [], b: string[] = [];
const text = "Chi shared the album Lisbon with you, and it has 412 photos";
notifyBefore("email", ana, text, (l) => a.push(l)); notifyBefore("push", ana, text, (l) => a.push(l));
notifyBefore("email", ben, text, (l) => a.push(l)); notifyBefore("push", ben, text, (l) => a.push(l));
const center = new NotificationCenter([new EmailNotifier((l) => b.push(l)), new PushNotifier((l) => b.push(l))]);
center.announce(ana, text); center.announce(ben, text);
assert.deepEqual(a, b);
console.log("notifiers:", b.length, "messages, same as the if/else version:", b[1]);
assert.equal(describe({ kind: "shared", album: "Lisbon", by: "Chi" }), "Chi shared the album Lisbon with you");
assert.equal(describe({ kind: "comment", photo: "871", by: "Ben", text: "Nice" }), "Ben commented: Nice");
assert.equal(describe({ kind: "removed", album: "Lisbon", by: "Ana" }), "Ana removed you from Lisbon");

// --- inheritance and composition
const plain = new Bag<string>(); plain.addAll(["a", "b", "c"]); assert.equal(plain.size, 3);
const inherited = new CountingBag<string>(); inherited.addAll(["a", "b", "c"]);
const composed = new CountedBag<string>(); composed.addAll(["a", "b", "c"]);
console.log(`CountingBag (inheritance): size ${inherited.size}, added ${inherited.added}`);
console.log(`CountedBag (composition):  size ${composed.size}, added ${composed.added}`);
assert.equal(inherited.added, 6); assert.equal(composed.added, 3);
inherited.add("d"); composed.add("d"); assert.equal(inherited.added, 7); assert.equal(composed.added, 4);
console.log("all assertions passed");
