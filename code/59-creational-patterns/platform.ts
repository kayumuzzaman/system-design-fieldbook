export interface Store {
  put(key: string, bytes: Uint8Array): string; // returns where the file went
}
export interface Queue {
  send(message: string): string; // returns what was sent where
}

// The abstract factory: one object that creates a whole matching set.
export interface Platform {
  createStore(): Store;
  createQueue(): Queue;
}

class S3Store implements Store {
  put(key: string): string {
    return `s3://photos-prod/${key}`;
  }
}
class SqsQueue implements Queue {
  send(message: string): string {
    return `sqs thumbnails <- ${message}`;
  }
}
class FolderStore implements Store {
  put(key: string): string {
    return `file:./data/${key}`;
  }
}
class MemoryQueue implements Queue {
  readonly messages: string[] = [];
  send(message: string): string {
    this.messages.push(message);
    return `memory queue <- ${message}`;
  }
}

export const cloudPlatform: Platform = {
  createStore: () => new S3Store(),
  createQueue: () => new SqsQueue(),
};
export const localPlatform: Platform = {
  createStore: () => new FolderStore(),
  createQueue: () => new MemoryQueue(),
};

// Application code is handed a platform and never names a concrete class.
export function startUploads(platform: Platform): (key: string, bytes: Uint8Array) => string {
  const store = platform.createStore();
  const queue = platform.createQueue();
  return (key, bytes) => queue.send(`make thumbnail of ${store.put(key, bytes)}`);
}
