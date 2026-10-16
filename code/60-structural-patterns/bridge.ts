// One side: how a message travels.
export interface Channel {
  deliver(to: string, title: string, body: string): string;
}
export const email: Channel = { deliver: (to, title, body) => `email to ${to}: [${title}] ${body}` };
export const push: Channel = { deliver: (to, title, body) => `push to ${to}: ${title}: ${body.slice(0, 30)}` };

// The other side: what the message says. Each notice holds a channel and does not care which.
export abstract class Notice {
  protected readonly channel: Channel;
  constructor(channel: Channel) {
    this.channel = channel;
  }
  abstract send(to: string): string;
}

export class ShareNotice extends Notice {
  private readonly by: string;
  private readonly album: string;
  constructor(channel: Channel, by: string, album: string) {
    super(channel);
    this.by = by;
    this.album = album;
  }
  send(to: string): string {
    return this.channel.deliver(to, "New shared album", `${this.by} shared the album ${this.album} with you`);
  }
}

export class DigestNotice extends Notice {
  private readonly newPhotos: number;
  constructor(channel: Channel, newPhotos: number) {
    super(channel);
    this.newPhotos = newPhotos;
  }
  send(to: string): string {
    return this.channel.deliver(to, "Your week in photos", `${this.newPhotos} new photos in albums you follow`);
  }
}
