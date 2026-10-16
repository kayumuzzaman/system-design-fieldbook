// Prints the data behind the chapter's charts as JSON: `node figures.ts > figures.json`. Seeded.
import { MODES, simulate } from "./onsale.ts";
import { outcome } from "./overbook.ts";
const onsale = MODES.map((m) => { const r = simulate(m); return { mode: m, series: r.series, soldToBuyers: r.soldToBuyers, lastSaleAt: r.lastSaleAt, ticketsToBots: r.ticketsToBots, gaveUp: r.humansGaveUp }; });
const overbook = Array.from({ length: 16 }, (_, pct) => { const o = outcome(100, pct, 0.92); return { pct, accepted: o.accepted, empty: Math.round(o.emptyRooms * 100) / 100, walked: Math.round(o.walkedGuests * 100) / 100, walkChance: Math.round(o.walkChance * 1000) / 1000 }; });
console.log(JSON.stringify({ onsale, overbook }));
