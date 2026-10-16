// Small objects packed into large append-only volumes, and the compaction that reclaims deleted space.
// A put appends to the open volume. A delete only marks bytes as garbage. A sealed volume whose garbage
// passes a threshold is compacted: its live objects are appended to the open volume, and it is freed.
import { Rng } from "./rng.ts";

export interface CompactionResult {
  threshold: number;
  spaceOverLive: number; // bytes held in volumes, over bytes of live objects: 1 means no waste
  writeAmplification: number; // bytes written, puts plus compaction copies, over bytes put
  volumesCompactedPerDay: number;
}

export function compaction(threshold: number, days = 730, putsPerDay = 5_000, volumeBytes = 5e8, seed = 91): CompactionResult {
  const rng = new Rng(seed);
  const lifetimes = [{ days: 1, share: 0.4 }, { days: 30, share: 0.4 }, { days: 365, share: 0.2 }];
  const size: number[] = [], volumeOf: number[] = [];
  const volumes: { bytes: number; garbage: number; objects: Set<number>; sealed: boolean }[] = [];
  const deletesOn: number[][] = Array.from({ length: days + 400 }, () => []);
  let open = -1;
  let put = 0, written = 0, compacted = 0, measuredDays = 0, spaceSum = 0, liveSum = 0, live = 0, putMeasured = 0, writtenMeasured = 0;
  const newVolume = () => { volumes.push({ bytes: 0, garbage: 0, objects: new Set(), sealed: false }); open = volumes.length - 1; };
  const append = (id: number) => {
    if (open < 0 || volumes[open]!.bytes + size[id]! > volumeBytes) {
      if (open >= 0) volumes[open]!.sealed = true;
      newVolume();
    }
    const v = volumes[open]!;
    v.bytes += size[id]!;
    v.objects.add(id);
    volumeOf[id] = open;
    written += size[id]!;
  };
  const from = days - 180; // measure the last six months, once the mix of lifetimes has settled
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < putsPerDay; i++) {
      const id = size.length;
      size.push(Math.round(Math.exp(Math.log(100_000) + 1.0 * normal(rng)))); // median 100 KB
      let r = rng.float(), life = lifetimes[lifetimes.length - 1]!.days;
      for (const l of lifetimes) { if ((r -= l.share) < 0) { life = l.days; break; } }
      deletesOn[day + life]!.push(id);
      put += size[id]!;
      live += size[id]!;
      append(id);
    }
    for (const id of deletesOn[day]!) {
      const v = volumes[volumeOf[id]!]!;
      v.garbage += size[id]!;
      v.objects.delete(id);
      live -= size[id]!;
    }
    let todayCompacted = 0;
    for (let i = 0; i < volumes.length; i++) {
      const v = volumes[i]!;
      if (!v.sealed || v.bytes === 0 || v.garbage / v.bytes <= threshold) continue;
      for (const id of [...v.objects]) append(id); // copy what is still live
      v.bytes = 0; v.garbage = 0; v.objects.clear(); v.sealed = false; // freed
      todayCompacted++;
    }
    if (day >= from) {
      measuredDays++;
      spaceSum += volumes.reduce((a, v) => a + v.bytes, 0);
      liveSum += live;
      compacted += todayCompacted;
    }
    if (day === from - 1) { putMeasured = put; writtenMeasured = written; }
  }
  return {
    threshold,
    spaceOverLive: spaceSum / liveSum,
    writeAmplification: (written - writtenMeasured) / (put - putMeasured),
    volumesCompactedPerDay: compacted / measuredDays,
  };
}

function normal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng.float())) * Math.cos(2 * Math.PI * rng.float());
}
