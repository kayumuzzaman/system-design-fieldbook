// Prints, as JSON, the measurements that the chapter's charts are drawn from.
import * as X from "./experiments.ts";

console.log(
  JSON.stringify({
    firstRepeat: X.firstRepeat(),
    repeatsAtScale: X.repeatsAtScale(),
    cache: X.cacheHitRatio(),
    aggregation: X.aggregation(),
  }),
);
