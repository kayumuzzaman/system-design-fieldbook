import type { Cache } from "./cache.ts";

// A cache that fetches what it does not have. It stores the promise of a value, so that many callers
// asking for the same missing key at once share one fetch. A failed fetch is not remembered.
export class LoadingCache<K, V> {
  private readonly cache: Cache<K, Promise<V>>;
  private readonly load: (key: K) => Promise<V>;

  constructor(cache: Cache<K, Promise<V>>, load: (key: K) => Promise<V>) {
    this.cache = cache;
    this.load = load;
  }

  get(key: K): Promise<V> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const loading = this.load(key);
    this.cache.put(key, loading); // before any await, so the next caller finds it
    loading.catch(() => {
      if (this.cache.get(key) === loading) this.cache.delete(key); // do not keep an error in the cache
    });
    return loading;
  }
}
