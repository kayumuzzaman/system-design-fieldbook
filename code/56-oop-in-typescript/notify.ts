export type User = { name: string; email: string; deviceToken?: string };
type Sent = (line: string) => void; // stands in for a mail server or a push service

// Before: one function that knows every channel. Each new channel means editing it again.
export function notifyBefore(channel: "email" | "push", to: User, text: string, sent: Sent): void {
  if (channel === "email") {
    sent(`email to ${to.email}: ${text}`);
  } else if (channel === "push") {
    if (to.deviceToken) sent(`push to ${to.deviceToken}: ${text.slice(0, 40)}`);
  }
}

// After: one interface, one class for each channel.
export interface Notifier {
  send(to: User, text: string): void;
}

export class EmailNotifier implements Notifier {
  private readonly sent: Sent;
  constructor(sent: Sent) {
    this.sent = sent;
  }
  send(to: User, text: string): void {
    this.sent(`email to ${to.email}: ${text}`);
  }
}

export class PushNotifier implements Notifier {
  private readonly sent: Sent;
  constructor(sent: Sent) {
    this.sent = sent;
  }
  send(to: User, text: string): void {
    if (to.deviceToken) this.sent(`push to ${to.deviceToken}: ${text.slice(0, 40)}`); // a push message is short
  }
}

// The caller holds a list of notifiers and treats them all alike.
export class NotificationCenter {
  private readonly channels: Notifier[];
  constructor(channels: Notifier[]) {
    this.channels = channels;
  }
  announce(to: User, text: string): void {
    for (const channel of this.channels) channel.send(to, text); // which send runs is decided here, at run time
  }
}
