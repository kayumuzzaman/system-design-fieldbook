export interface ImportReport {
  imported: string[];
  skipped: string[];
}
type Save = (name: string, bytes: Uint8Array) => Promise<void>;

// The template method form: the base class owns the steps and their order.
export abstract class Importer {
  private readonly save: Save;
  constructor(save: Save) {
    this.save = save;
  }

  // The template method. Subclasses cannot change it, only fill in its steps.
  async run(source: string): Promise<ImportReport> {
    const report: ImportReport = { imported: [], skipped: [] };
    for (const name of await this.list(source)) {
      if (!this.accepts(name)) {
        report.skipped.push(name);
        continue;
      }
      await this.save(name, await this.read(source, name));
      report.imported.push(name);
    }
    return report;
  }

  protected abstract list(source: string): Promise<string[]>;
  protected abstract read(source: string, name: string): Promise<Uint8Array>;
  // A hook: a step with a default that a subclass may replace.
  protected accepts(name: string): boolean {
    return /\.(jpe?g|png|heic)$/i.test(name);
  }
}

// The same algorithm with the steps passed in. No base class, no subclass.
export interface Reader {
  list(source: string): Promise<string[]>;
  read(source: string, name: string): Promise<Uint8Array>;
  accepts?(name: string): boolean;
}
const isImage = (name: string): boolean => /\.(jpe?g|png|heic)$/i.test(name);

export async function importFrom(reader: Reader, source: string, save: Save): Promise<ImportReport> {
  const report: ImportReport = { imported: [], skipped: [] };
  for (const name of await reader.list(source)) {
    if (!(reader.accepts ?? isImage)(name)) {
      report.skipped.push(name);
      continue;
    }
    await save(name, await reader.read(source, name));
    report.imported.push(name);
  }
  return report;
}
