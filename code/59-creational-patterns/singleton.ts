// The textbook form: the class guards its own single instance.
export class Settings {
  private static instance: Settings | undefined;
  readonly maxUploadBytes = 20_000_000;

  private constructor() {} // nobody outside can call new

  static get(): Settings {
    Settings.instance ??= new Settings();
    return Settings.instance;
  }
}

// The same thing in a module: this line runs once, however many files import it.
export const settings = { maxUploadBytes: 20_000_000 } as const;
