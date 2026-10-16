export interface Notifier {
  send(to: string, text: string): Promise<void>;
}

// Each decorator is a Notifier that holds another Notifier.
export class Retrying implements Notifier {
  private readonly inner: Notifier;
  private readonly attempts: number;

  constructor(inner: Notifier, attempts = 3) {
    this.inner = inner;
    this.attempts = attempts;
  }

  async send(to: string, text: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.inner.send(to, text);
      } catch (error) {
        if (attempt >= this.attempts) throw error;
      }
    }
  }
}

export class Logging implements Notifier {
  private readonly inner: Notifier;
  private readonly log: (line: string) => void;

  constructor(inner: Notifier, log: (line: string) => void) {
    this.inner = inner;
    this.log = log;
  }

  async send(to: string, text: string): Promise<void> {
    this.log(`sending to ${to}`);
    try {
      await this.inner.send(to, text);
      this.log("sent");
    } catch (error) {
      this.log(`failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
