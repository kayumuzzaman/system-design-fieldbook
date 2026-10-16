// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { behind, burst, herd, onInterval } from "./simulate.ts";

const policies = ["drop-newest", "drop-oldest", "block"] as const;
const bursts = [];
for (const overflow of policies) {
  const { written, dropped, finishedAt, longestWait, lastWrite } = await burst(overflow);
  bursts.push({ overflow, written, dropped, finishedAt, longestWait, lastWrite });
}
const overrun = {
  interval: await onInterval(10_000, 25_000, 100_000),
  "catch-up": await behind("catch-up", 10_000, 25_000, null, 100_000),
  once: await behind("once", 10_000, 25_000, null, 100_000),
  skip: await behind("skip", 10_000, 25_000, null, 100_000),
};
const paused = {
  "catch-up": await behind("catch-up", 10_000, 2_000, [15_000, 55_000], 100_000),
  once: await behind("once", 10_000, 2_000, [15_000, 55_000], 100_000),
  skip: await behind("skip", 10_000, 2_000, [15_000, 55_000], 100_000),
};
console.log(JSON.stringify({ bursts, overrun, paused, herd: [await herd(false), await herd(true)] }));
