import type { UploadEvent, UploadState as StateName } from "./table.ts";

// One method for each event. Each returns the state the upload is in afterward.
export type UploadState = { readonly name: StateName } & Record<UploadEvent, (upload: Upload) => UploadState>;

// The default answer to every event is no. A state overrides only the events it accepts.
abstract class Refusing implements UploadState {
  abstract readonly name: StateName;
  start(_: Upload): UploadState { return this.refuse("start"); }
  received(_: Upload): UploadState { return this.refuse("received"); }
  processed(_: Upload): UploadState { return this.refuse("processed"); }
  error(_: Upload): UploadState { return this.refuse("error"); }
  retry(_: Upload): UploadState { return this.refuse("retry"); }
  cancel(_: Upload): UploadState { return this.refuse("cancel"); }
  private refuse(event: UploadEvent): never {
    throw new Error(`an upload that is ${this.name} cannot ${event}`);
  }
}

class Pending extends Refusing {
  readonly name = "pending";
  override start(upload: Upload): UploadState { return new Uploading(upload); }
  override cancel(): UploadState { return new Canceled(); }
}
class Uploading extends Refusing {
  readonly name = "uploading";
  constructor(upload: Upload) {
    super();
    upload.countAttempt(); // the action on the way in
  }
  override received(): UploadState { return new Processing(); }
  override error(): UploadState { return new Failed(); }
  override cancel(): UploadState { return new Canceled(); }
}
class Processing extends Refusing {
  readonly name = "processing";
  override processed(): UploadState { return new Ready(); }
  override error(): UploadState { return new Failed(); }
}
class Failed extends Refusing {
  readonly name = "failed";
  override retry(upload: Upload): UploadState {
    if (upload.attempts >= Upload.maxAttempts) throw new Error("no attempts left"); // the guard
    return new Uploading(upload);
  }
  override cancel(): UploadState { return new Canceled(); }
}
class Ready extends Refusing { readonly name = "ready"; }
class Canceled extends Refusing { readonly name = "canceled"; }

// The context. It holds the current state object and passes every event to it.
export class Upload {
  static readonly maxAttempts = 3;
  readonly id: string;
  private current: UploadState = new Pending();
  private tries = 0;

  constructor(id: string) {
    this.id = id;
  }
  get state(): StateName { return this.current.name; }
  get attempts(): number { return this.tries; }
  countAttempt(): void { this.tries += 1; }

  handle(event: UploadEvent): void {
    this.current = this.current[event](this);
  }
}
