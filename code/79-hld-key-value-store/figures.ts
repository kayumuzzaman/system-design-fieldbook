// Prints, as JSON, the measurements the chapter's figures are drawn from.
import * as X from "./experiments.ts";

console.log(JSON.stringify({
  spread: X.spread(),
  quorums: X.quorums(),
  quorumsOneDown: X.quorums(undefined, 20, true),
  partition: [X.partition(false, false), X.partition(true, false), X.partition(true, true)],
  merkle: X.merkle(),
  cart: X.cart(),
}));
