// Prints, as JSON, the numbers the chapter's figures are drawn from. Same seeds as the test.
import { EXPIRY_MIX, PASTEBIN } from "./estimate.ts";
import { liveByDay } from "./expiry.ts";
import { hitRatioOf, reuseDistances } from "./readpath.ts";
import { generate, MODEL } from "./workload.ts";

const PASTE = PASTEBIN.pasteKb * 1000;
const SIZES = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20]; // GB of cache at the real rate
const round = (x: number) => Math.round(x * 10_000) / 10_000;

function curve(scale: number, days: number, delayHours: number) {
  const w = generate({ ...MODEL, delayHours, pastesPerDay: 500_000 * scale, days, seed: 76 });
  const from = 2 * 86_400;
  const onMiss = reuseDistances(w, "on a miss", 2), onCreate = reuseDistances(w, "on create too", 2);
  const entries = (gb: number) => Math.round((gb * 1e9 / PASTE) * scale);
  return {
    sizes: SIZES,
    onMiss: SIZES.map((gb) => round(hitRatioOf(onMiss, entries(gb), from).hitRatio)),
    onCreate: SIZES.map((gb) => round(hitRatioOf(onCreate, entries(gb), from).hitRatio)),
    flushed: hitRatioOf(onCreate, entries(5), from, 4 * 86_400).hourly.slice(48, 60).map(round),
  };
}

const main = curve(0.1, 6, MODEL.delayHours);
const slow = curve(0.05, 10, 24); // reads spread over a day on average instead of six hours
const fast = curve(0.05, 6, 2);
const live = liveByDay(5_000, 400, EXPIRY_MIX, 76).map((n) => n * 100); // at a hundredth of the rate, scaled back
console.log(JSON.stringify({ main, slow: { onCreate: slow.onCreate }, fast: { onCreate: fast.onCreate }, live: live.filter((_, d) => d % 5 === 0) }));
