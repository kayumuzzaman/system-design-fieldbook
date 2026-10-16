// Prints, as JSON, the measurements the chapter's figures are drawn from.
import * as X from "./experiments.ts";

console.log(JSON.stringify({ race: X.race(), local: X.localShares(), sync: X.syncIntervals(), outage: X.outage() }));
