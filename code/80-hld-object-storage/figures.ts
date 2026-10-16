// Prints, as JSON, the numbers the chapter's figures are drawn from.
import * as X from "./experiments.ts";

console.log(JSON.stringify({ grid: X.durabilityGrid(), validation: X.validation(), racks: X.racks(), compaction: X.thresholds() }));
