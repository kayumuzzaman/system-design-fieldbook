export type StoredPhoto = { bytes: number; deleted: boolean };
export type Usage = { photos: number; gigabytes: number };
type Send = (to: string, html: string) => void;

// Before: one class answers to three different people.
export class UsageReportBefore {
  private readonly photos: StoredPhoto[];
  private readonly send: Send;

  constructor(photos: StoredPhoto[], send: Send) {
    this.photos = photos;
    this.send = send;
  }

  usage(): Usage { // the finance team decides what counts toward a bill
    const kept = this.photos.filter((p) => !p.deleted);
    return { photos: kept.length, gigabytes: Math.ceil(kept.reduce((sum, p) => sum + p.bytes, 0) / 1e9) };
  }
  html(): string { // the design team decides how it looks
    const u = this.usage();
    return `<h1>Your storage</h1><p>${u.photos} photos, ${u.gigabytes} GB</p>`;
  }
  email(to: string): void { // the operations team decides how mail is delivered
    this.send(to, this.html());
  }
}

// After: one piece for each of them.
export function usageOf(photos: StoredPhoto[]): Usage {
  const kept = photos.filter((p) => !p.deleted);
  return { photos: kept.length, gigabytes: Math.ceil(kept.reduce((sum, p) => sum + p.bytes, 0) / 1e9) };
}

export function usageAsHtml(usage: Usage): string {
  return `<h1>Your storage</h1><p>${usage.photos} photos, ${usage.gigabytes} GB</p>`;
}

export class ReportMailer {
  private readonly send: Send;
  constructor(send: Send) {
    this.send = send;
  }
  deliver(to: string, html: string): void {
    this.send(to, html);
  }
}
