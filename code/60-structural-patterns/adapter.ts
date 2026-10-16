// The interface the rest of the photos service is written against.
export interface PhotoStore {
  save(id: string, bytes: Uint8Array): Promise<void>;
  load(id: string): Promise<Uint8Array | null>;
}

// The shape of a storage vendor's client library. We did not design it and cannot change it.
export interface BucketClient {
  putObject(input: { Bucket: string; Key: string; Body: Uint8Array }): Promise<{ ETag: string }>;
  getObject(input: { Bucket: string; Key: string }): Promise<{ Body: Uint8Array }>; // throws an error named "NoSuchKey"
}

// The adapter: implements our interface by translating each call into theirs.
export class BucketPhotoStore implements PhotoStore {
  private readonly client: BucketClient;
  private readonly bucket: string;

  constructor(client: BucketClient, bucket: string) {
    this.client = client;
    this.bucket = bucket;
  }

  async save(id: string, bytes: Uint8Array): Promise<void> {
    await this.client.putObject({ Bucket: this.bucket, Key: `photos/${id}`, Body: bytes });
  }

  async load(id: string): Promise<Uint8Array | null> {
    try {
      return (await this.client.getObject({ Bucket: this.bucket, Key: `photos/${id}` })).Body;
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") return null; // their "missing" becomes ours
      throw error;
    }
  }
}
