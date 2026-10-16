// A writing session: three people take turns typing at their own cursors, with backspaces and jumps,
// on three replicas that exchange every change at once. Used to measure what a CRDT keeps.
import { Rga, type Change } from "./rga.ts";
import { seeded } from "./rng.ts";

export function session(keystrokes: number, seed = 1): Rga[] {
  const random = seeded(seed);
  const sites = ["ana", "ben", "cy"].map((s) => new Rga(s));
  const cursor = [0, 0, 0];
  const send = (from: number, c: Change) => sites.forEach((s, j) => { if (j !== from) s.receive(c); });
  let who = 0;
  for (let k = 0; k < keystrokes; k += 1) {
    if (k % 50 === 0) who = Math.floor(random() * 3);                   // turns of about 50 keystrokes
    const s = sites[who] as Rga, len = s.length();
    let at = Math.min(cursor[who] as number, len);
    const r = random();
    if (r < 0.02 || at > len) at = Math.floor(random() * (len + 1));      // click somewhere else
    if (r > 0.9 && at > 0) { send(who, s.remove(at - 1)); at -= 1; }    // backspace
    else { send(who, s.insert(at, "etaoin shrdlu"[Math.floor(random() * 13)] as string)); at += 1; }
    cursor[who] = at;
    // others' cursors move with the text before them (a simplification: shift right on inserts before them)
  }
  return sites;
}
