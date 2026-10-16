export type UploadState = "pending" | "uploading" | "processing" | "ready" | "failed" | "canceled";
export type UploadEvent = "start" | "received" | "processed" | "error" | "retry" | "cancel";

// The whole state diagram as data: for each state, which events it accepts and where they lead.
const transitions: Record<UploadState, Partial<Record<UploadEvent, UploadState>>> = {
  pending: { start: "uploading", cancel: "canceled" },
  uploading: { received: "processing", error: "failed", cancel: "canceled" },
  processing: { processed: "ready", error: "failed" },
  failed: { retry: "uploading", cancel: "canceled" },
  ready: {},
  canceled: {},
};

export class Upload {
  static readonly maxAttempts = 3;
  readonly id: string;
  private current: UploadState = "pending";
  private tries = 0;

  constructor(id: string) {
    this.id = id;
  }

  get state(): UploadState {
    return this.current;
  }
  get attempts(): number {
    return this.tries;
  }

  handle(event: UploadEvent): void {
    const target = transitions[this.current][event];
    if (!target) throw new Error(`an upload that is ${this.current} cannot ${event}`);
    if (event === "retry" && this.tries >= Upload.maxAttempts) throw new Error("no attempts left"); // the guard
    if (target === "uploading") this.tries += 1; // the action on the way in
    this.current = target;
  }
}
