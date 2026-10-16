import type { StubModel, Usage } from "./model.ts";

// One server-sent event: an id the client can resume from, a type, and one line of JSON.
export function sseEvent(id: number, type: string, data: unknown): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
export function parseEvents(text: string): { id: number; type: string; data: unknown }[] {
  return text.split("\n\n").filter((block) => block.trim()).map((block) => {
    const field = (name: string) => block.split("\n").find((l) => l.startsWith(name + ": "))?.slice(name.length + 2) ?? "";
    return { id: Number(field("id")), type: field("event"), data: JSON.parse(field("data")) };
  });
}

// The browser's side of a connection, as the server sees it: it can be written to until it closes.
export class Connection {
  readonly received: string[] = [];
  closed = false;
  private readonly closeHandlers: (() => void)[] = [];
  private readonly closeAfter: number;
  constructor(closeAfter = Infinity) {
    this.closeAfter = closeAfter; // a test can make the browser leave after this many events
  }
  write(chunk: string): void {
    if (this.closed) return;           // writing to a closed connection fails quietly, as a socket write would
    this.received.push(chunk);
    if (this.received.length >= this.closeAfter) this.close();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) handler();
  }
  onClose(handler: () => void): void { this.closeHandlers.push(handler); }
}

// Relays a model's tokens to the browser as they are produced. When the browser goes away, the abort is
// passed on to the model call, so that the model stops producing (and billing) tokens nobody will read.
export async function relay(model: StubModel, prompt: string, browser: Connection, passOnCancel: boolean): Promise<Usage> {
  const upstream = new AbortController();
  if (passOnCancel) browser.onClose(() => upstream.abort());
  const tokens = model.generate(prompt, { maxTokens: 1000, signal: upstream.signal });
  let id = 0;
  for (;;) {
    const next = await tokens.next();
    if (next.done) {
      browser.write(sseEvent(++id, "done", { usage: next.value }));
      return next.value;
    }
    browser.write(sseEvent(++id, "token", { text: next.value }));
  }
}

// A generation that belongs to the response, not to the connection. Its events are kept, so a browser that
// drops off can reconnect with the id of the last event it saw (the Last-Event-ID header) and carry on.
// Only an explicit stop cancels it. In production the events would live in a shared store with an expiry.
export class ResumableResponse {
  readonly events: string[] = [];
  readonly finished: Promise<Usage>;
  private readonly stopper = new AbortController();
  private readonly watchers = new Set<(event: string) => void>();

  constructor(model: StubModel, prompt: string) {
    this.finished = this.run(model, prompt);
  }
  private async run(model: StubModel, prompt: string): Promise<Usage> {
    const tokens = model.generate(prompt, { maxTokens: 1000, signal: this.stopper.signal });
    for (;;) {
      const next = await tokens.next();
      if (next.done) {
        this.publish(this.stopper.signal.aborted ? "stopped" : "done", { usage: next.value });
        return next.value;
      }
      this.publish("token", { text: next.value });
    }
  }
  private publish(type: string, data: unknown): void {
    const event = sseEvent(this.events.length + 1, type, data);
    this.events.push(event);
    for (const watch of this.watchers) watch(event);
  }
  // Sends everything after `lastEventId`, then each new event as it happens.
  connect(browser: Connection, lastEventId = 0): void {
    for (const event of this.events.slice(lastEventId)) browser.write(event);
    if (browser.closed) return;
    const watch = (event: string) => browser.write(event);
    this.watchers.add(watch);
    browser.onClose(() => this.watchers.delete(watch));
  }
  stop(): void { this.stopper.abort(); }
}
