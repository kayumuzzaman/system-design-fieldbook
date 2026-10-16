import assert from "node:assert/strict";
import { annualLoss, meanHoursToLoss, nines } from "./durability.ts";
import { Bucket } from "./metadata.ts";
import * as X from "./experiments.ts";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

// The model: with no parity, the mean time to loss is the time to the first failure of k pieces.
{
  const lambda = -Math.log(1 - 0.0136) / 8760;
  assert.ok(Math.abs(meanHoursToLoss(1, 0, 0.0136, 24) - 1 / lambda) < 1e-6);
  assert.ok(annualLoss(1, 2, 0.0136, 24) > annualLoss(6, 3, 0.0136, 24), "6 + 3 is more durable than 3 copies");
  console.log("model: a single copy is lost at the disk failure rate; 6 + 3 beats 3 copies at the same repair time");
}

// A. The model at Backblaze's 2025 failure rate.
for (const s of X.durabilityGrid()) {
  console.log(`${s.name} (${s.overhead.toFixed(2)} times the data): ` + s.byRepair.map((r) => `${r.repairHours} h ${r.nines.toFixed(1)} nines`).join(", "));
}

// B. The model against a simulation of 120 disks in 12 racks, at failure rates high enough to count losses.
for (const v of X.validation()) {
  console.log(`${v.label}: ${v.failures} disk failures, ${v.losses} stripes lost, ${v.perStripeYear.toFixed(5)} per stripe a year; model ${v.model.toFixed(5)}`);
  assert.ok(Math.abs(v.perStripeYear / v.model - 1) < 0.15, "simulation and model agree within 15%");
}

// C. One rack destroyed.
for (const r of X.racks()) {
  console.log(`${r.name}, a rack destroyed: placed at random ${pct(r.random, 3)} of objects lost, one piece a rack ${pct(r.rackAware, 3)}`);
  assert.equal(r.rackAware, 0);
}

// D. Compaction.
for (const c of X.thresholds()) {
  console.log(`compact at ${pct(c.threshold, 0)} garbage: space ${c.spaceOverLive.toFixed(2)} times live data, bytes written ${c.writeAmplification.toFixed(2)} times bytes put, ${c.volumesCompactedPerDay.toFixed(1)} volumes a day`);
}

// E. Versions and delete markers.
{
  const b = new Bucket(true);
  const v1 = b.put("photos/cat.jpg", "vol7:0", 4_000_000, 0).version;
  const v2 = b.put("photos/cat.jpg", "vol9:512", 4_100_000, 1).version;
  b.put("photos/dog.jpg", "vol9:9000", 3_000_000, 1);
  assert.equal((b.get("photos/cat.jpg") as { version: { versionId: string } }).version.versionId, v2.versionId);
  const del = b.delete("photos/cat.jpg", 2);
  assert.deepEqual(del.garbage, []); // a delete marker frees nothing
  assert.deepEqual(b.get("photos/cat.jpg"), { status: 404, deleteMarker: true });
  assert.equal(b.get("photos/cat.jpg", v1.versionId).status, 200); // old versions stay readable by id
  assert.deepEqual(b.list("photos/", "", 10), ["photos/dog.jpg"]);
  const marker = b.versionsOf("photos/cat.jpg").at(-1)!;
  b.delete("photos/cat.jpg", 3, marker.versionId); // removing the marker undeletes
  assert.equal((b.get("photos/cat.jpg") as { version: { versionId: string } }).version.versionId, v2.versionId);
  b.delete("photos/cat.jpg", 4);
  const expired = b.expireNoncurrent(40, 30);
  assert.deepEqual(expired.map((v) => v.versionId).sort(), [v1.versionId, v2.versionId].sort());
  assert.deepEqual(b.versionsOf("photos/cat.jpg"), []); // only a marker was left, so the key is gone
  const plain = new Bucket(false);
  plain.put("a", "vol1:0", 10, 0);
  assert.equal(plain.put("a", "vol1:10", 12, 1).garbage.length, 1); // without versioning, an overwrite frees the old bytes
  console.log("versions: a delete adds a marker and frees nothing; old versions stay readable; removing the marker undeletes; lifecycle frees noncurrent versions after 30 days");
}
console.log("all tests passed");
