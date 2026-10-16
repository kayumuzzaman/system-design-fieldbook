export type Preset = { name: string; crop: { width: number; height: number }; filters: string[] };

// A copy made with spread shares everything below the first level.
export function shallowCopy(preset: Preset, name: string): Preset {
  return { ...preset, name };
}

// structuredClone copies all the way down. It is built into the language runtime.
export function deepCopy(preset: Preset, name: string): Preset {
  return { ...structuredClone(preset), name };
}

// For a class with methods, the object knows best how to copy itself.
export class EditPreset {
  readonly name: string;
  private readonly crop: { width: number; height: number };
  private readonly filters: string[];

  constructor(name: string, crop: { width: number; height: number }, filters: string[]) {
    this.name = name;
    this.crop = crop;
    this.filters = filters;
  }

  clone(name: string): EditPreset {
    return new EditPreset(name, { ...this.crop }, [...this.filters]); // new containers, so the copies are independent
  }
  narrowTo(width: number): void {
    this.crop.width = width;
  }
  describe(): string {
    return `${this.name}: ${this.crop.width}x${this.crop.height}, ${this.filters.join("+")}`;
  }
}
