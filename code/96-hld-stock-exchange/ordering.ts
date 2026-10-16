// What goes wrong without a sequencer. Two gateways send orders for one symbol, and each of two
// replicas receives both streams over its own network path with a little random delay ("jitter").
// Each replica matches in the order things reached it. Do the replicas agree on the trades?
import { OrderBook, type BookEvent } from "./book.ts";
import { orderFlow, toCommand, type Intent } from "./flow.ts";
import { seeded } from "./rng.ts";

interface Msg { readonly gateway: number; readonly index: number; readonly sent: number; readonly intent: Intent }

function sendTimes(random: () => number, gateway: number, intents: Intent[], meanGapNs: number): Msg[] {
  let t = 0;
  return intents.map((intent, index) => { t += -Math.log(1 - random()) * meanGapNs; return { gateway, index, sent: t, intent }; });
}

// One replica: its own arrival order, its own sequence numbers, and the trades it makes.
function replay(msgs: readonly Msg[], random: () => number, jitterNs: number): { trades: string[]; filled: Map<string, number> } {
  const last = [0, 0];
  const arrived = msgs.map((m) => {
    // the same gateway's messages keep their order (one TCP connection); different gateways can swap
    const at = Math.max(m.sent + 5_000 + random() * jitterNs, (last[m.gateway] as number) + 1);
    last[m.gateway] = at;
    return { m, at };
  }).sort((a, b) => a.at - b.at);
  const book = new OrderBook();
  const seqOf = new Map<string, number>();
  const keyOf = new Map<number, string>();
  const trades: string[] = [];
  const filled = new Map<string, number>();
  arrived.forEach(({ m }, i) => {
    const seq = i + 1, key = `${m.gateway}:${m.index}`;
    seqOf.set(key, seq); keyOf.set(seq, key);
    const events: BookEvent[] = [];
    book.submit(toCommand(m.intent, (j) => seqOf.get(`${m.gateway}:${j}`) as number), seq, events);
    for (const e of events) {
      if (e.type !== "trade") continue;
      const taker = keyOf.get(e.taker) as string, maker = keyOf.get(e.maker) as string;
      trades.push(`${taker}>${maker}@${e.price}x${e.qty}`);
      filled.set(taker, (filled.get(taker) ?? 0) + e.qty);
      filled.set(maker, (filled.get(maker) ?? 0) + e.qty);
    }
  });
  return { trades: trades.sort(), filled };
}

export interface OrderingResult { readonly jitterUs: number; readonly runs: number; readonly diverged: number; readonly ordersDiffering: number; readonly orders: number }

export function withoutSequencer(jitterUs: number, runs: number, perGateway: number, meanGapNs: number): OrderingResult {
  let diverged = 0, ordersDiffering = 0, orders = 0;
  for (let run = 0; run < runs; run += 1) {
    const random = seeded(1000 + run);
    const msgs = [0, 1].flatMap((g) => sendTimes(random, g, orderFlow(random, perGateway, { symbols: ["ACME"], traders: [`g${g}a`, `g${g}b`] }), meanGapNs));
    const a = replay(msgs, seeded(5000 + run), jitterUs * 1000);
    const b = replay(msgs, seeded(9000 + run), jitterUs * 1000);
    if (a.trades.join() !== b.trades.join()) diverged += 1;
    for (const m of msgs) {
      if (m.intent.kind === "cancel") continue;
      orders += 1;
      const k = `${m.gateway}:${m.index}`;
      if ((a.filled.get(k) ?? 0) !== (b.filled.get(k) ?? 0)) ordersDiffering += 1;
    }
  }
  return { jitterUs, runs, diverged, ordersDiffering, orders };
}
