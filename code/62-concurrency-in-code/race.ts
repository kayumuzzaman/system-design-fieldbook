export class Quota {
  readonly limit: number;
  private bytesUsed = 0;
  private readonly save: (bytes: number) => Promise<void>;

  constructor(limit: number, save: (bytes: number) => Promise<void>) {
    this.limit = limit;
    this.save = save;
  }
  get used(): number {
    return this.bytesUsed;
  }

  // Broken: the check and the update are separated by an await.
  async addRacy(bytes: number): Promise<boolean> {
    if (this.bytesUsed + bytes > this.limit) return false;
    await this.save(bytes); // other calls run while this one waits here
    this.bytesUsed += bytes;
    return true;
  }

  // Fixed: claim the space before waiting, and give it back if the save fails.
  async addReserved(bytes: number): Promise<boolean> {
    if (this.bytesUsed + bytes > this.limit) return false;
    this.bytesUsed += bytes;
    try {
      await this.save(bytes);
      return true;
    } catch (error) {
      this.bytesUsed -= bytes;
      throw error;
    }
  }
}
