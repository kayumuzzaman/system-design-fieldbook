type Album = { id: string; owner: string; sharedWith: string[] };

// Stand-ins for a real database client and a real mail client.
export class SqlAlbums {
  find(_id: string): Album {
    throw new Error("no database is reachable from here");
  }
  save(_album: Album): void {
    throw new Error("no database is reachable from here");
  }
}
export class SmtpMailer {
  send(_to: string, _text: string): void {
    throw new Error("no mail server is reachable from here");
  }
}

// Before: the rule about sharing creates its own database and mail clients.
export class ShareAlbumBefore {
  private readonly albums = new SqlAlbums();
  private readonly mailer = new SmtpMailer();

  run(albumId: string, by: string, withUser: string): void {
    const album = this.albums.find(albumId);
    if (album.owner !== by) throw new Error("only the owner can share an album");
    if (!album.sharedWith.includes(withUser)) album.sharedWith.push(withUser);
    this.albums.save(album);
    this.mailer.send(withUser, `${by} shared an album with you`);
  }
}

// After: the rule says what it needs, as interfaces it owns. Something else decides what to plug in.
export interface Albums {
  find(id: string): Album;
  save(album: Album): void;
}
export interface Mailer {
  send(to: string, text: string): void;
}

export class ShareAlbum {
  private readonly albums: Albums;
  private readonly mailer: Mailer;

  constructor(albums: Albums, mailer: Mailer) {
    this.albums = albums;
    this.mailer = mailer;
  }

  run(albumId: string, by: string, withUser: string): void {
    const album = this.albums.find(albumId);
    if (album.owner !== by) throw new Error("only the owner can share an album");
    if (!album.sharedWith.includes(withUser)) album.sharedWith.push(withUser);
    this.albums.save(album);
    this.mailer.send(withUser, `${by} shared an album with you`);
  }
}

// The one place that knows which real classes exist. It runs once, when the program starts.
export function buildShareAlbum(): ShareAlbum {
  return new ShareAlbum(new SqlAlbums(), new SmtpMailer());
}
