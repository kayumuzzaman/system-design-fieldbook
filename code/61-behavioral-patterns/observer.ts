type Listener<T> = (payload: T) => void;

// A small typed subject. Events is a map from event name to the data that comes with it.
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  // Subscribing returns the function that unsubscribes.
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(listener);
    return () => set.delete(listener);
  }

  // Every listener is told, even if an earlier one throws. The errors are returned to the caller.
  emit<K extends keyof Events>(event: K, payload: Events[K]): unknown[] {
    const errors: unknown[] = [];
    for (const listener of [...(this.listeners[event] ?? [])]) {
      try {
        listener(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  count<K extends keyof Events>(event: K): number {
    return this.listeners[event]?.size ?? 0;
  }
}

export type AlbumEvents = {
  photoAdded: { album: string; photo: string };
  shared: { album: string; with: string };
};

// The subject. It announces what happened and knows nothing about who is listening.
export class Album {
  readonly events = new Emitter<AlbumEvents>();
  readonly name: string;
  private readonly photos: string[] = [];

  constructor(name: string) {
    this.name = name;
  }

  add(photo: string): void {
    this.photos.push(photo);
    this.events.emit("photoAdded", { album: this.name, photo });
  }
}
