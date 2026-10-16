// Prints the data behind the chapter's charts as JSON: node lld/ts84/figures.ts > ch84/figures.json
import { scenarios, world } from './auth.ts';
import { OUTBOUND, OUTBOUND_POLICIES, runOutbound } from './outbound.ts';

const auth = scenarios(world()).map((s) => ({ name: s.name, ...s.verdict }));
const outbound = OUTBOUND_POLICIES.map((p) => {
  const r = runOutbound(OUTBOUND, p);
  return { policy: p, medianOtherByMinute: r.medianOtherByMinute.map((x) => Number(x.toFixed(2))) };
});
console.log(JSON.stringify({ auth, config: OUTBOUND, outbound }));
