// The sequencer: one place that decides the order of everything.
// It numbers each command, appends it to the journal, and hands the same numbered command to every replica.
import type { Command } from "./book.ts";
import type { Sequenced } from "./engine.ts";

export class Sequencer {
  private next = 1;
  readonly journal: Sequenced[] = [];
  private readonly replicas: ((s: Sequenced) => void)[] = [];

  attach(replica: (s: Sequenced) => void): void { this.replicas.push(replica); }

  // `time` is the sequencer's clock when the command arrived: the only clock the engine ever sees.
  accept(symbol: string, cmd: Command, time: number): Sequenced {
    const s: Sequenced = { seq: this.next, time, symbol, cmd };
    this.next += 1;
    this.journal.push(s);                   // durable first (in production: written and replicated before use)
    for (const r of this.replicas) r(s);   // then every engine applies it, in the same order
    return s;
  }
}
