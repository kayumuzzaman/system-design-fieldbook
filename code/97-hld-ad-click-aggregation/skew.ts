// Hot ads. Clicks are partitioned by ad, so one very popular ad puts all of its clicks on one partition.
// Combining at the click servers (one message per ad per server per second, carrying a count)
// shrinks both the total number of messages and the hot partition's share.
import { zipf } from "./clicks.ts";
import { seeded } from "./rng.ts";

export interface SkewResult { readonly messages: number; readonly busiestShare: number; readonly averageShare: number; readonly load: readonly number[] }

function hash(n: number): number { return Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0; }

export function skew(perSecond: number, seconds: number, ads: number, s: number, partitions: number, servers: number, combine: boolean, seed = 3): SkewResult {
  const random = seeded(seed);
  const pick = zipf(random, ads, s);
  const load = new Array<number>(partitions).fill(0);
  let messages = 0;
  for (let t = 0; t < seconds; t += 1) {
    const pending = new Set<string>();                // (server, ad) pairs with clicks this second
    for (let i = 0; i < perSecond; i += 1) {
      const ad = pick(), server = Math.floor(random() * servers);
      if (combine) {
        const k = `${server}:${ad}`;
        if (pending.has(k)) continue;
        pending.add(k);
      }
      messages += 1;
      load[hash(ad) % partitions] = (load[hash(ad) % partitions] as number) + 1;
    }
  }
  return { messages, busiestShare: Math.max(...load) / messages, averageShare: 1 / partitions, load };
}
