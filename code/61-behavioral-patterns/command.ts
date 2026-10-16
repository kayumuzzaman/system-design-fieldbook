export interface Picture {
  width: number;
  height: number;
  rotation: number;
  filters: string[];
}

// A command is a request turned into an object: it can be run now, kept, and taken back later.
export interface Command {
  readonly label: string;
  run(): void;
  undo(): void;
}

export class Rotate implements Command {
  readonly label: string;
  private readonly picture: Picture;
  private readonly degrees: number;

  constructor(picture: Picture, degrees: number) {
    this.picture = picture;
    this.degrees = degrees;
    this.label = `rotate ${degrees}`;
  }
  run(): void { this.picture.rotation = (this.picture.rotation + this.degrees + 360) % 360; }
  undo(): void { this.picture.rotation = (this.picture.rotation - this.degrees + 360) % 360; }
}

export class Crop implements Command {
  readonly label: string;
  private readonly picture: Picture;
  private readonly width: number;
  private readonly height: number;
  private before: { width: number; height: number } | null = null;

  constructor(picture: Picture, width: number, height: number) {
    this.picture = picture;
    this.width = width;
    this.height = height;
    this.label = `crop to ${width}x${height}`;
  }
  // Cropping cannot be reversed by arithmetic, so the command remembers what it replaced.
  run(): void {
    this.before = { width: this.picture.width, height: this.picture.height };
    this.picture.width = this.width;
    this.picture.height = this.height;
  }
  undo(): void {
    if (!this.before) throw new Error("undo before run");
    this.picture.width = this.before.width;
    this.picture.height = this.before.height;
  }
}

export class AddFilter implements Command {
  readonly label: string;
  private readonly picture: Picture;
  private readonly filter: string;

  constructor(picture: Picture, filter: string) {
    this.picture = picture;
    this.filter = filter;
    this.label = `filter ${filter}`;
  }
  run(): void { this.picture.filters.push(this.filter); }
  undo(): void { this.picture.filters.pop(); }
}

// The invoker. It runs commands without knowing what any of them does.
export class History {
  private readonly done: Command[] = [];
  private readonly undone: Command[] = [];

  run(command: Command): void {
    command.run();
    this.done.push(command);
    this.undone.length = 0; // a new action ends the possibility of redo
  }
  undo(): boolean {
    const command = this.done.pop();
    if (!command) return false;
    command.undo();
    this.undone.push(command);
    return true;
  }
  redo(): boolean {
    const command = this.undone.pop();
    if (!command) return false;
    command.run();
    this.done.push(command);
    return true;
  }
  get labels(): string[] { return this.done.map((command) => command.label); }
  get redoable(): string[] { return this.undone.map((command) => command.label); }
}
