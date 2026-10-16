// The other way to model "one of several kinds": a union of plain data, and functions that switch on it.
export type AlbumEvent =
  | { kind: "shared"; album: string; by: string }
  | { kind: "comment"; photo: string; by: string; text: string }
  | { kind: "removed"; album: string; by: string };

export function describe(event: AlbumEvent): string {
  switch (event.kind) {
    case "shared":
      return `${event.by} shared the album ${event.album} with you`;
    case "comment":
      return `${event.by} commented: ${event.text}`;
    case "removed":
      return `${event.by} removed you from ${event.album}`;
    default: {
      const missed: never = event; // a compile error here means a kind was added and not handled
      throw new Error(`unhandled event: ${JSON.stringify(missed)}`);
    }
  }
}
