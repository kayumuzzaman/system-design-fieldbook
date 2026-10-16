// The client and the server of a central-server OT system, in the style of Jupiter and Google Docs.
// The server orders every operation; each client applies its own edits at once and transforms what arrives.
import { apply, compose, transform, type Op } from "./ot.ts";

export interface ToServer { readonly client: string; readonly base: number; readonly op: Op }
export interface FromServer { readonly revision: number; readonly op: Op; readonly author: string }

export class Server {
  doc: string;
  readonly history: Op[] = [];                 // history[r] turned revision r into r + 1
  transforms = 0;
  constructor(doc: string) { this.doc = doc; }
  receive(m: ToServer): FromServer {
    let op = m.op;
    // the client had not seen the operations made since its base revision: move its operation past each of them
    for (let r = m.base; r < this.history.length; r += 1) { op = transform(op, this.history[r] as Op)[0]; this.transforms += 1; }
    this.doc = apply(this.doc, op);
    this.history.push(op);
    return { revision: this.history.length, op, author: m.client };
  }
}

export class Client {
  readonly id: string;
  doc: string;
  revision: number;
  private sent: Op | null = null;              // sent, not yet acknowledged
  private waiting: Op | null = null;           // made since, not yet sent
  constructor(id: string, doc: string, revision: number) { this.id = id; this.doc = doc; this.revision = revision; }

  // A local edit shows at once. At most one operation is in flight; later edits are combined and wait.
  edit(op: Op): ToServer | null {
    this.doc = apply(this.doc, op);
    if (this.sent === null) { this.sent = op; return { client: this.id, base: this.revision, op }; }
    this.waiting = this.waiting === null ? op : compose(this.waiting, op);
    return null;
  }

  // Everything the server broadcasts, in order: the acknowledgment of our own operation, or someone else's.
  receive(m: FromServer): ToServer | null {
    this.revision = m.revision;
    if (m.author === this.id) {
      this.sent = this.waiting; this.waiting = null;
      return this.sent === null ? null : { client: this.id, base: this.revision, op: this.sent };
    }
    let op = m.op;
    if (this.sent !== null) { [this.sent, op] = transform(this.sent, op); }
    if (this.waiting !== null) { [this.waiting, op] = transform(this.waiting, op); }
    this.doc = apply(this.doc, op);
    return null;
  }
}
