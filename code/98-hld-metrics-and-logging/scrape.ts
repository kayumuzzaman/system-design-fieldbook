// When to scrape each target. If every target is scraped at the start of the interval, the samples
// arrive in one burst; Prometheus instead gives each target a fixed offset from a hash of the target.
export type Schedule = "aligned" | "hashed";

function fnv(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function perSecond(targets: number, intervalMs: number, samplesPerTarget: number, schedule: Schedule): number[] {
  const seconds = new Array<number>(Math.ceil(intervalMs / 1000)).fill(0);
  for (let i = 0; i < targets; i += 1) {
    const offset = schedule === "aligned" ? 0 : fnv(`host-${i}:9100`) % intervalMs;
    const s = Math.floor(offset / 1000);
    seconds[s] = (seconds[s] as number) + samplesPerTarget;
  }
  return seconds;
}
